# OpenHWP

> English: [README.en.md](./README.en.md)

**OpenHWP는 [Deno desktop](https://docs.deno.com/runtime/desktop/)과 [rhwp](https://github.com/edwardkim/rhwp) 위에서 동작하는 오픈소스 HWP/HWPX 데스크톱 앱입니다.**

한컴오피스 없이도 macOS, Windows, Linux에서 한글 **HWP**, **HWPX** 문서를 열고 볼 수 있으며, (로드맵상) 편집도 지원할 예정입니다. 문서 엔진은 [rhwp](https://github.com/edwardkim/rhwp)(Rust + WebAssembly)이고, OpenHWP는 그 위에 얇게 씌운 데스크톱 껍데기입니다.

> **상태: 초기 개발 단계.** 기반이 되는 엔진과 데스크톱 런타임이 모두 아직 초기라 호환성이 깨지는 변경이 잦을 수 있습니다. 현재 저장소에는 프로젝트 뼈대와 문서만 있고, 애플리케이션 코드는 이후에 추가됩니다.

## 기술 스택

OpenHWP는 Deno 하나로 이루어진 툴체인 위에서 동작합니다. 데스크톱 껍데기는 얇게 유지하고, 문서와 관련된 일은 모두 `rhwp`에 맡깁니다.

| 구분                | 선택                                                            |
| ------------------- | --------------------------------------------------------------- |
| 데스크톱 셸         | `deno desktop` (Deno 호스트 + 웹뷰)                             |
| 렌더링 엔진         | **CEF 백엔드** (Chromium — 모든 플랫폼에서 동일한 렌더링)        |
| 문서 엔진           | WebAssembly로 올린 `rhwp` (`@rhwp/core` / `@rhwp/editor`)        |
| 파일 열기 / 저장    | **File System Access API** (`showOpenFilePicker` / `showSaveFilePicker`) |
| 네이티브 메뉴 / 창  | Deno desktop 메뉴 + `bindings`                                  |
| 툴체인              | Deno (단일 툴체인)                                              |

## 아키텍처

OpenHWP는 셸을 얇게 유지하고 문서 관련 작업을 모두 `rhwp`에 위임하여, "문서 엔진"과 "플랫폼 셸"을 깔끔하게 분리합니다.

```
┌────────────────────────────────────────────────────────────┐
│  deno desktop 바이너리                                       │
│                                                             │
│  ┌───────────────┐          ┌───────────────────────────┐  │
│  │ Deno 호스트    │  bind()  │ 웹뷰 (CEF / Chromium)     │  │
│  │  (main.ts)     │◀────────▶│                           │  │
│  │                │ bindings │  rhwp 엔진 (WASM):        │  │
│  │ • Deno.serve() │          │   @rhwp/core  → 렌더링     │  │
│  │ • 앱 메뉴      │          │   @rhwp/editor → 편집 UI   │  │
│  │ • 창 관리      │          │                           │  │
│  │                │          │  File System Access API:  │  │
│  │                │          │   showOpenFilePicker()    │  │
│  │                │          │   showSaveFilePicker()    │  │
│  └───────────────┘          └───────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

- **Deno desktop 셸** — `Deno.serve()`가 네이티브 창에 UI를 제공합니다. **CEF 백엔드**(`deno.json`의
  `"backend": "cef"`)는 Chromium을 내장하므로 플랫폼과 무관하게 렌더링이 동일하고, 아래의 최신 웹 API를
  그대로 쓸 수 있습니다. 네이티브 애플리케이션 메뉴와 창 관리는 `Deno.BrowserWindow`(`setApplicationMenu`,
  `menuclick` 이벤트)로 처리하고, 호스트 함수는 [`bindings`](https://docs.deno.com/runtime/desktop/bindings/)로
  웹뷰에 노출합니다.
- **rhwp 엔진 (WebAssembly)** — 파싱, 레이아웃, 렌더링은 `rhwp`가 맡습니다. 셸에 직접 컴파일해 넣는 대신
  npm 패키지로 가져다 씁니다.
  - [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) — WASM 파서/렌더러
    (`import init, { HwpDocument } from '@rhwp/core'` → `await init()` → `new HwpDocument(bytes)` →
    `doc.renderPageSvg(0)`). 보기 기능에 사용합니다.
  - [`@rhwp/editor`](https://www.npmjs.com/package/@rhwp/editor) — 전체 편집기 UI
    (`createEditor('#editor')`, iframe 임베드). 편집 기능에 사용합니다.
- **파일 열기 / 저장** — **[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker)**.
  CEF 백엔드는 Chromium이고 Deno가 앱을 `localhost`(보안 컨텍스트)에서 서빙하므로,
  `window.showOpenFilePicker({ types: [{ accept: { 'application/octet-stream': ['.hwp', '.hwpx'] } }] })`와
  `window.showSaveFilePicker(...)`로 실제 네이티브 대화상자를 띄울 수 있습니다. 반환된 `FileSystemFileHandle`을
  보관해 두면 **저장** 시 같은 파일에 다시 묻지 않고 덮어씁니다. 덕분에 (아직 네이티브 파일 선택 API가 없는)
  Deno 쪽에서 파일 선택기를 따로 만들 필요가 없습니다.

## 개발

> 애플리케이션 코드(`deno.json`의 `desktop` 블록, `main.ts`, UI)는 아직 저장소에 없습니다. 아래는 앞으로
> 만들어 갈 대략적인 형태이며, 구현이 진행되면서 채워집니다.

### 사전 요구사항

- [Deno](https://deno.com) **2.9.0 이상** (`deno desktop`은 2.9에서 도입). `deno --version`으로 확인하세요.

### 예정된 명령

```sh
# 개발 모드로 실행 (웹뷰가 Deno.serve()를 따라감)
deno task dev

# Chromium(CEF) 백엔드로 독립 실행 데스크톱 바이너리 빌드
deno desktop main.ts --backend cef

# 플랫폼별 설치 파일(.dmg / .msi / .deb) 생성 — deno.json의 desktop.output으로 설정
deno desktop main.ts
```

## 로드맵

1. **뷰어** — File System Access API로 `.hwp` / `.hwpx` 파일을 열고, `@rhwp/core`로 페이지를 SVG로 렌더링.
2. **편집기** — `@rhwp/editor`를 임베드하고, **저장** / **다른 이름으로 저장**을 `FileSystemFileHandle`로
   디스크에 연결. 네이티브 메뉴와 다중 창 지원 포함.
3. **내보내기 · 인쇄** — (`rhwp` 기반) PDF 내보내기와 웹뷰 인쇄 경로.
4. **패키징** — 서명/공증된 `.dmg`, `.msi`, `.deb` / `.AppImage` / `.rpm` 빌드를 CI에서 생성.

## 크레딧

- 문서 엔진: Edward Kim의 [**rhwp**](https://github.com/edwardkim/rhwp) — 이 프로젝트를 가능하게 한
  Rust/WASM HWP 엔진.

## 라이선스

[MIT](./LICENSE) © Passion Factory
