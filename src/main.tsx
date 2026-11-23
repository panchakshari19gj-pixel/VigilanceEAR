import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// MediaPipe Tasks Vision routes Emscripten C++ stderr (including benign TFLite INFO logs)
// to console.error. Downgrade those informational messages to console.info while preserving real errors.
if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  const originalConsoleError = console.error.bind(console);
  const TFLITE_BENIGN_PATTERNS = [
    /^INFO:\s*Created TensorFlow Lite/i,
    /Created TensorFlow Lite XNNPACK delegate/i,
    /feedback_manager\.cc/i,
    /gl_context(_webgl)?\.cc/i,
    /Graph successfully started running/i,
    /landmark_projection_calculator/i,
    /inference_feedback_manager/i,
    /^[IW]\d{4}\s+\d{2}:\d{2}:\d{2}/,
  ];

  console.error = (...args: unknown[]) => {
    const joined = args
      .filter((a): a is string => typeof a === 'string')
      .join(' ');
    if (joined && TFLITE_BENIGN_PATTERNS.some((re) => re.test(joined))) {
      console.info(...args);
      return;
    }
    originalConsoleError(...args);
  };
}

createRoot(document.getElementById('root')!).render(<App />);
