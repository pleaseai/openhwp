# OpenHWP

> English: [README.en.md](./README.en.md)

**OpenHWP는 [Deno desktop](https://docs.deno.com/runtime/desktop/)과 [rhwp](https://github.com/edwardkim/rhwp)로 만드는 오픈소스 HWP/HWPX 데스크톱 앱입니다.**

한컴오피스 없이 macOS, Windows, Linux에서 한글 HWP·HWPX 문서를 열고 봅니다. 편집은 로드맵에 있습니다. 문서 파싱과 렌더링은 [rhwp](https://github.com/edwardkim/rhwp)(Rust + WebAssembly) 엔진이 맡고, OpenHWP는 그 위에 데스크톱 껍데기를 얇게 씌웁니다.

> **상태: 초기 개발 단계입니다.** 지금 저장소에는 프로젝트 뼈대와 문서만 있고, 애플리케이션 코드는 아직 없습니다. 기반 엔진과 Deno desktop 런타임이 모두 초기라 호환성이 깨지는 변경이 잦을 수 있습니다.

## 동작 방식

OpenHWP는 Deno 하나로 된 툴체인 위에서 돌아갑니다. 데스크톱 껍데기는 얇게 두고 문서와 관련된 일은 모두 rhwp에 맡겨, "문서 엔진"과 "플랫폼 셸"을 분리합니다.

- **데스크톱 셸** — `deno desktop`. `Deno.serve()`가 내보내는 화면을 네이티브 창의 webview가 띄웁니다.
- **렌더링 백엔드** — CEF(Chromium). `deno.json`에 `"backend": "cef"`로 지정하면 모든 OS에서 렌더링이 같고, 아래의 최신 웹 API를 그대로 씁니다.
- **문서 엔진** — WebAssembly로 올린 rhwp. 셸에 직접 컴파일해 넣지 않고 npm 패키지로 가져옵니다.
- **파일 열기·저장** — File System Access API.
- **네이티브 메뉴·창** — Deno desktop 메뉴와 `bindings`.

### 문서 엔진: rhwp

[`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core)는 WASM 파서·렌더러입니다. 보기 기능에 씁니다.

```js
import init, { HwpDocument } from "@rhwp/core";

await init();
const doc = new HwpDocument(bytes);
document.querySelector("#viewer").innerHTML = doc.renderPageSvg(0);
```

[`@rhwp/editor`](https://www.npmjs.com/package/@rhwp/editor)는 iframe으로 임베드하는 전체 편집기 UI입니다. 편집 기능에 씁니다.

```js
import { createEditor } from "@rhwp/editor";

const editor = await createEditor("#editor");
```

### 파일 열기·저장: File System Access API

CEF 백엔드는 Chromium이고 Deno가 앱을 `localhost`(보안 컨텍스트)에서 서빙하므로, 웹 표준 [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker)를 그대로 씁니다. 덕분에 (아직 네이티브 파일 선택 API가 없는) Deno 쪽에 파일 선택기를 따로 만들지 않아도 됩니다.

```js
// 열기 — .hwp / .hwpx만 고르도록 제한합니다.
const [handle] = await window.showOpenFilePicker({
  types: [{ accept: { "application/octet-stream": [".hwp", ".hwpx"] } }],
});
const file = await handle.getFile();
const bytes = new Uint8Array(await file.arrayBuffer());

// 저장 — 열 때 받은 handle을 재사용하면 다시 묻지 않습니다.
const writable = await handle.createWritable();
await writable.write(bytes);
await writable.close();
```

## 빠른 시작

> 애플리케이션 코드(`deno.json`의 `desktop` 블록, `main.ts`, UI)는 아직 없습니다. 아래는 앞으로 만들 흐름이며, 구현이 진행되면 채워집니다.

[Deno](https://deno.com) 2.9.0 이상이 필요합니다(`deno desktop`은 2.9에서 들어왔습니다). 버전은 `deno --version`으로 확인합니다.

```sh
# 개발 모드로 실행
deno task dev

# Chromium(CEF) 백엔드로 실행 바이너리 빌드
deno desktop main.ts --backend cef

# 플랫폼 설치 파일(.dmg / .msi / .deb) 생성 — deno.json의 desktop.output으로 설정
deno desktop main.ts
```

## 로드맵

1. **뷰어** — File System Access API로 `.hwp`·`.hwpx`를 열고 `@rhwp/core`로 페이지를 SVG로 렌더링합니다.
2. **편집기** — `@rhwp/editor`를 임베드하고, 저장·다른 이름으로 저장을 `FileSystemFileHandle`로 디스크에 잇습니다. 네이티브 메뉴와 다중 창을 포함합니다.
3. **내보내기·인쇄** — rhwp 기반 PDF 내보내기와 webview 인쇄.
4. **패키징** — 서명·공증한 `.dmg`, `.msi`, `.deb`·`.AppImage`·`.rpm`을 CI에서 빌드합니다.

## 기여와 문의

버그와 제안은 [이슈 트래커](https://github.com/pleaseai/openhwp/issues)에 남겨 주십시오. 아직 초기 단계라 구조가 자주 바뀝니다.

## 크레딧

- 문서 엔진: Edward Kim의 [rhwp](https://github.com/edwardkim/rhwp) — 이 프로젝트를 가능하게 한 Rust/WASM HWP 엔진입니다.

## 라이선스

[MIT](./LICENSE) © Passion Factory
