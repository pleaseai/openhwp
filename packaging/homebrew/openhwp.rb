# Homebrew cask reference copy.
#
# The authoritative cask lives at Casks/openhwp.rb in pleaseai/homebrew-tap and
# is rewritten on every release by the update-homebrew-cask job in
# .github/workflows/release.yml. This file is the reviewable copy of that
# template — keep the two in sync when either changes.
#
# Install:  brew install --cask pleaseai/tap/openhwp
#
# The version and sha256 values are placeholders; the release job fills
# them from the published SHA256SUMS asset.
cask "openhwp" do
  arch arm: "darwin-arm64", intel: "darwin-x64"

  version "0.0.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/pleaseai/openhwp/releases/download/v#{version}/OpenHWP-#{arch}.dmg"
  name "OpenHWP"
  desc "Open-source HWP/HWPX desktop editor"
  homepage "https://github.com/pleaseai/openhwp"

  depends_on macos: ">= :monterey"

  app "OpenHWP.app"

  zap trash: [
    "~/Library/Application Support/dev.pleaseai.openhwp",
    "~/Library/Caches/dev.pleaseai.openhwp",
    "~/Library/Preferences/dev.pleaseai.openhwp.plist",
    "~/Library/Saved Application State/dev.pleaseai.openhwp.savedState",
  ]
end
