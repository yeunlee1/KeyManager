import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import App from './App';
import { applyStoredTheme } from './lib/theme';
import { ToastProvider } from './components/ui/toast';
import { TooltipProvider } from './components/ui/tooltip';
import { AuthProvider } from './features/auth/AuthProvider';
import { setKdfRunner } from './lib/crypto/argon2';
import { workerKdfRunner } from './lib/crypto/kdf-worker-runner';

// Argon2id 계산은 웹 작업자에서 돌려 화면이 멈추지 않게 한다.
setKdfRunner(workerKdfRunner);
applyStoredTheme();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <TooltipProvider>
          {/* Base UI의 대화상자·팝업이 페이지 위에 겹치도록 새 쌓임 맥락을 만든다(coss ui 권장). */}
          <div className="isolate">
            <AuthProvider>
              <App />
            </AuthProvider>
          </div>
        </TooltipProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
