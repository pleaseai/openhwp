# Changelog

## [0.2.3](https://github.com/pleaseai/openhwp/compare/v0.2.2...v0.2.3) (2026-07-29)


### Bug Fixes

* **studio:** make 파일 → 인쇄 work in the desktop app ([#23](https://github.com/pleaseai/openhwp/issues/23)) ([cdf4059](https://github.com/pleaseai/openhwp/commit/cdf40598221a549d9197a37fcd4ffdf6459a8240))

## [0.2.2](https://github.com/pleaseai/openhwp/compare/v0.2.1...v0.2.2) (2026-07-28)


### Bug Fixes

* **release:** smoke test a copy so the shipped bundle stays sealed ([#21](https://github.com/pleaseai/openhwp/issues/21)) ([c7f7232](https://github.com/pleaseai/openhwp/commit/c7f72327f51156978815941a0bfc8e271563e01e))

## [0.2.1](https://github.com/pleaseai/openhwp/compare/v0.2.0...v0.2.1) (2026-07-28)


### Bug Fixes

* **release:** grant V8 the JIT entitlements the Hardened Runtime requires ([#20](https://github.com/pleaseai/openhwp/issues/20)) ([aeec07c](https://github.com/pleaseai/openhwp/commit/aeec07cc2332112852fd9792c23bec5b5ef32866))
* **release:** sign nested code so notarization succeeds, and surface the notary log ([#18](https://github.com/pleaseai/openhwp/issues/18)) ([202215e](https://github.com/pleaseai/openhwp/commit/202215ebf599b730040c17df70032184fe56a691))

## [0.2.0](https://github.com/pleaseai/openhwp/compare/v0.1.0...v0.2.0) (2026-07-28)


### Features

* **release:** package and distribute macOS builds via GitHub Releases and Homebrew ([#17](https://github.com/pleaseai/openhwp/issues/17)) ([15bf08a](https://github.com/pleaseai/openhwp/commit/15bf08a9e63270bfda5c7ebb6c296b1cbab32b02))


### Bug Fixes

* **release:** point release-please at the deno.json that holds the version ([#14](https://github.com/pleaseai/openhwp/issues/14)) ([47d600c](https://github.com/pleaseai/openhwp/commit/47d600cf122315725c12a706c839fdb3a09dcf7d)), closes [#10](https://github.com/pleaseai/openhwp/issues/10)

## 0.1.0 (2026-07-24)


### Features

* embed full rhwp-studio editor via Deno workspace ([#9](https://github.com/pleaseai/openhwp/issues/9)) ([b73f1bd](https://github.com/pleaseai/openhwp/commit/b73f1bd1c462046e539bec454208cd69504630df))
* scaffold Deno desktop app (viewer) ([b0b7e5e](https://github.com/pleaseai/openhwp/commit/b0b7e5e60d03a714ba81dd51950997d61064130a))
* **ui:** vendor the rhwp engine locally (offline, strict CSP) ([001d834](https://github.com/pleaseai/openhwp/commit/001d834b7afac7ee80644b611e7f463f2f58b64a))


### Documentation

* note pre-1.0 versioning policy in CONTRIBUTING ([#7](https://github.com/pleaseai/openhwp/issues/7)) ([21ed463](https://github.com/pleaseai/openhwp/commit/21ed4637db06c820b6ebd0ed6823965d497ec3dc))
