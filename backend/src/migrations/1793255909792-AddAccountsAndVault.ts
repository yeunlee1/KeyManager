// 계정·세션·초대·확인 기록·금고(묶음·접근·항목)·열람 기록 표를 만드는 마이그레이션. 기존 license_keys는 건드리지 않는다.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountsAndVault1793255909792 implements MigrationInterface {
  name = "AddAccountsAndVault1793255909792";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        login_id varchar(64) NOT NULL UNIQUE CHECK (login_id = lower(login_id)),
        name varchar(100) NOT NULL,
        role varchar(16) NOT NULL CHECK (role IN ('admin', 'member')),
        status varchar(16) NOT NULL CHECK (status IN ('pending_totp', 'active', 'disabled')),
        kdf_salt varchar(64) NOT NULL,
        kdf_params jsonb NOT NULL,
        auth_hash varchar(64) NOT NULL,
        auth_salt varchar(64) NOT NULL,
        recovery_auth_hash varchar(64) NOT NULL,
        recovery_auth_salt varchar(64) NOT NULL,
        account_key_master text NOT NULL,
        account_key_recovery text NOT NULL,
        enc_public_key text NOT NULL,
        enc_private_key text NOT NULL,
        sign_public_key text NOT NULL,
        sign_private_key text NOT NULL,
        totp_secret_enc text,
        -- 등록을 시작했지만 아직 코드로 확인하지 않은 새 2단계 인증 비밀값
        totp_pending_enc text,
        totp_last_step bigint,
        backup_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        failed_attempts int NOT NULL DEFAULT 0,
        locked_until timestamptz,
        last_login_at timestamptz,
        invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
        -- 관리자 승인 서명: 확인된 관리자가 이 사람의 ID·아이디·공개키들에 서명한 값. 첫 관리자는 자기 서명이다.
        admin_grant_sig text,
        admin_granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_admin_grant_chk CHECK (role <> 'admin' OR admin_grant_sig IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE invites (
        id uuid PRIMARY KEY,
        token_hash varchar(64) NOT NULL UNIQUE,
        login_id varchar(64) NOT NULL CHECK (login_id = lower(login_id)),
        name varchar(100) NOT NULL,
        role varchar(16) NOT NULL CHECK (role IN ('admin', 'member')),
        created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        secret_enc text NOT NULL,
        inviter_mac varchar(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        accepted_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        accept_mac varchar(64),
        verified_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE trust_records (
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        record_enc text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_user_id, subject_user_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY,
        token_hash varchar(64) NOT NULL UNIQUE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stage varchar(20) NOT NULL
          CHECK (stage IN ('pending_totp', 'enroll_totp', 'recovery_enroll', 'recovery', 'full')),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        ip varchar(64),
        user_agent varchar(256),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX sessions_user_idx ON sessions (user_id)`);

    await queryRunner.query(`
      CREATE TABLE vault_groups (
        id uuid PRIMARY KEY,
        generation int NOT NULL DEFAULT 1 CHECK (generation >= 1),
        name_enc text NOT NULL,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE vault_group_access (
        group_id uuid NOT NULL REFERENCES vault_groups(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission varchar(8) NOT NULL CHECK (permission IN ('view', 'edit')),
        is_member boolean NOT NULL,
        generation int NOT NULL CHECK (generation >= 1),
        wrapped_key text NOT NULL,
        shared_by uuid REFERENCES users(id) ON DELETE SET NULL,
        share_signature text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (group_id, user_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX vault_group_access_user_idx ON vault_group_access (user_id)`);

    await queryRunner.query(`
      CREATE TABLE vault_items (
        id uuid PRIMARY KEY,
        group_id uuid REFERENCES vault_groups(id) ON DELETE CASCADE,
        owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        key_generation int,
        item_key_enc text NOT NULL,
        summary_enc text NOT NULL,
        secret_enc text NOT NULL,
        revision int NOT NULL DEFAULT 1 CHECK (revision >= 1),
        needs_rotation boolean NOT NULL DEFAULT false,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        -- 묶음 항목과 개인 항목 중 정확히 하나여야 하고, 묶음 항목은 열쇠 세대가 있어야 한다.
        CONSTRAINT vault_items_owner_chk CHECK ((group_id IS NULL) <> (owner_user_id IS NULL)),
        CONSTRAINT vault_items_generation_chk CHECK (group_id IS NULL OR key_generation IS NOT NULL)
      )
    `);
    await queryRunner.query(`CREATE INDEX vault_items_group_idx ON vault_items (group_id)`);
    await queryRunner.query(`CREATE INDEX vault_items_owner_idx ON vault_items (owner_user_id)`);

    await queryRunner.query(`
      CREATE TABLE audit_events (
        id bigserial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(40) NOT NULL,
        result varchar(16) NOT NULL DEFAULT 'ok',
        target_type varchar(20),
        target_id varchar(64),
        group_id uuid,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        ip varchar(64),
        user_agent varchar(256)
      )
    `);
    await queryRunner.query(`CREATE INDEX audit_events_at_idx ON audit_events (at DESC)`);
    await queryRunner.query(`CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id)`);
    await queryRunner.query(`CREATE INDEX audit_events_group_idx ON audit_events (group_id)`);
  }

  // 되돌리면 이 마이그레이션이 만든 표만 지운다. 기존 license_keys와 그 자료는 그대로다.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS audit_events, vault_items, vault_group_access, vault_groups,
        sessions, trust_records, invites, users
    `);
  }
}
