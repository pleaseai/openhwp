# OpenHWP

> English: [README.en.md](./README.en.md)

**OpenHWP는 [Deno desktop](https://docs.deno.com/runtime/desktop/)과 [rhwp](https://github.com/edwardkim/rhwp)로 만드는 오픈소스 HWP/HWPX 데스크톱 앱입니다.**

한컴오피스 없이 macOS, Windows, Linux에서 한글 HWP·HWPX 문서를 열고, 편집하고, 저장합니다. 문서 작업은 전체 [rhwp-studio](https://github.com/edwardkim/rhwp)(Rust + WebAssembly) 편집기가 맡고, OpenHWP는 그 위에 데스크톱 껍데기를 얇게 씌웁니다.

> **상태: 초기 개발 단계입니다.** OpenHWP는 전체 rhwp-studio 편집기를 임베드하는 얇은 네이티브 셸입니다(아래 빠른 시작 참고). 기반 엔진과 Deno desktop 런타임이 모두 초기라 호환성이 깨지는 변경이 잦을 수 있습니다.

## 동작 방식

OpenHWP는 네이티브 셸과 웹 계층, 두 부분으로 이루어진 Deno 워크스페이스입니다. 파싱·레이아웃·렌더링·편집·저장까지 문서와 관련된 일은 모두 웹 계층이 맡고, 그 웹 계층은 **손대지 않은 업스트림 rhwp-studio 편집기**입니다. 셸은 그것을 띄우는 일만 합니다.

| 경로               | 커밋   | 설명                                                                                                   |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------ |
| `apps/desktop`     | 예     | `deno desktop`(CEF) 셸 — 번들을 서빙하고, 창을 열고, 네이티브 메뉴를 답니다.                            |
| `apps/studio-host` | 일부   | 웹 계층. `vendor/rhwp-core/`(`@rhwp/core` WASM 엔진)는 커밋하고, 빌드 결과인 `dist/`는 커밋하지 않습니다. |
| `third_party/rhwp` | 아니오 | 업스트림 rhwp. `config/rhwp-studio-overrides.json`에 고정한 커밋으로 스파스 체크아웃해 내려받습니다.     |
| `scripts/`         | 예     | `setup-rhwp.ts`가 그 고정 커밋을 준비하고, `build-studio.ts`가 번들을 빌드합니다.                        |

### 셸

`apps/desktop/main.ts`는 백 줄 남짓이고 하는 일은 세 가지입니다.

1. `apps/studio-host/dist`를 `127.0.0.1`의 임의 포트에 묶어 HTTP로 서빙합니다.
2. `Deno.BrowserWindow`를 열고 그 주소로 이동시킵니다.
3. 호스트 조작만 담은 네이티브 메뉴를 답니다 — 종료, 새로 고침, 개발자 도구 토글.

렌더링은 `apps/desktop/deno.json`의 `"backend": "cef"`로 고른 CEF(Chromium)에서 돌아갑니다. 덕분에 모든 OS에서 webview가 똑같이 동작하고, 아래의 웹 API를 어디서나 쓸 수 있습니다.

### 소스 오버라이드가 없는 이유

셸이 스튜디오를 `http://127.0.0.1`에서 서빙하고 webview는 이를 보안 컨텍스트로 취급하므로, 업스트림의 **웹** 코드 경로가 그대로 동작합니다. 업스트림 브리지가 WASM 엔진을 올리고, 열기·저장 명령은 File System Access API의 [`showOpenFilePicker`](https://developer.mozilla.org/ko/docs/Web/API/Window/showOpenFilePicker)와 `showSaveFilePicker`를 호출합니다. CEF의 Chromium이 두 API를 모두 구현하므로 손대지 않은 업스트림 빌드가 이미 온전한 편집기로 동작하고, OpenHWP는 소스 패치 없이 그대로 씁니다. 덕분에 (아직 네이티브 파일 선택 API가 없는) Deno 쪽에 파일 선택기를 따로 만들지 않아도 됩니다.

**열기·편집 메뉴는 네이티브 메뉴로 올리지 않고 스튜디오 자체 메뉴 막대**와 `Cmd`/`Ctrl`+`O`·`S` 단축키에 그대로 둡니다. File System Access 선택기는 사용자가 방금 조작했다는 상태(transient user activation)를 요구하는데, 네이티브 메뉴 클릭은 그 상태를 webview로 넘겨주지 못하기 때문입니다. 그래서 네이티브 메뉴를 편집기에 잇는 일은 불러오기·저장 훅을 노출하는 스튜디오 오버라이드가 필요하며, 아직은 계획 단계입니다.

### 빌드

`deno task setup`은 `third_party/rhwp`를 준비합니다. 업스트림을 blob 필터와 cone 스파스로 클론해 `rhwp-studio`와 `assets`만 받으므로 전체 1.1 GB 모노레포 대신 80 MB 남짓이면 되고, 체크아웃 위치는 `config/rhwp-studio-overrides.json`에 고정한 커밋입니다.

`deno task build:studio`는 업스트림 Vite 프로젝트를 제자리에서 빌드합니다. 커밋해 둔 `vendor/rhwp-core`에서 `pkg/`를 넣어 주므로 Rust·`wasm-pack` 툴체인이 필요 없고, 번들된 예제 문서를 지우고, PWA 서비스 워커를 끄고, `vite build --base=/`를 실행합니다. 업스트림 트리는 끝난 뒤 원래대로 되돌리며 결과물은 `apps/studio-host/dist`로 옮깁니다.

엔진과 스튜디오, 대체 폰트 36종은 모두 로컬에서 서빙하므로 네트워크 없이도 앱이 동작합니다. 예외가 하나 있습니다. 대부분의 HWP 문서가 기본으로 쓰는 함초롬 계열은 업스트림 폰트 로더가 공개 CDN에서 받아 오므로, 이 계열만은 제 글꼴로 렌더링하려면 네트워크가 필요합니다. [#12](https://github.com/pleaseai/openhwp/issues/12)에서 다룹니다.

## 빠른 시작

[Deno](https://deno.com) 2.9.0 이상(`deno desktop`은 2.9에서 들어왔습니다)과, 스튜디오 번들을 빌드할 때 필요한 Node.js·npm이 있어야 합니다. 버전은 `deno --version`으로 확인합니다.

OpenHWP는 전체 [rhwp-studio](https://github.com/edwardkim/rhwp) 편집기를 임베드하며, 그 번들(`apps/studio-host/dist`)은 저장소에 커밋하지 않으므로 먼저 빌드해야 합니다.

```sh
# 1. 고정된 업스트림 rhwp 체크아웃(third_party/rhwp) 준비 — 최초 1회
deno task setup

# 2. 스튜디오 번들 빌드 → apps/studio-host/dist
deno task build:studio

# 3. 개발 모드로 실행 (apps/desktop 셸이 번들을 띄웁니다)
deno task dev

# 실행 바이너리·설치 파일(.dmg / .msi / .AppImage) 빌드 — apps/desktop/deno.json의 desktop.output으로 설정
deno task build
```

## 로드맵

1. **임베드 편집기** — *0.1.0에 반영.* 전체 rhwp-studio 편집기로 `.hwp`·`.hwpx`를 열고, 편집하고, 저장합니다.
2. **네이티브 통합** — 네이티브 메뉴를 편집기에 잇고, 문서 제목과 저장하지 않은 상태를 창에 반영하고, 앱 브랜딩을 넣습니다. `config/rhwp-studio-overrides.json`에서 관리하는 오버라이드로 들어옵니다.
3. **내보내기·인쇄** — rhwp 기반 PDF 내보내기와 webview 인쇄.
4. **패키징** — 서명·공증한 `.dmg`, `.msi`, `.deb`·`.AppImage`·`.rpm`을 CI에서 빌드합니다.

## 기여와 문의

버그와 제안은 [이슈 트래커](https://github.com/pleaseai/openhwp/issues)에 남겨 주십시오. 아직 초기 단계라 구조가 자주 바뀝니다.

## 크레딧

- 문서 엔진: Edward Kim의 [rhwp](https://github.com/edwardkim/rhwp) — 이 프로젝트를 가능하게 한 Rust/WASM HWP 엔진입니다.

## 라이선스

[MIT](./LICENSE) © Passion Factory
