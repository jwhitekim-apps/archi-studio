// pdf.js 워커는 메인 스레드와 전역 범위가 달라 메인 쪽 폴리필이 적용되지 않는다.
// 워커 진입점에서 폴리필을 한 번 더 건 다음 실제 워커 코드를 불러온다.
// 폴리오 web/src/utils/pdf-worker-entry.js에서 옮김.
import './safari-polyfills';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
