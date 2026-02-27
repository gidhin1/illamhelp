#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_GRADLE="android/app/build.gradle"
ROOT_GRADLE="android/build.gradle"
if [[ ! -f "$APP_GRADLE" ]]; then
  echo "Missing $APP_GRADLE. Run Expo prebuild for Android first."
  exit 1
fi

if [[ ! -f "$ROOT_GRADLE" ]]; then
  echo "Missing $ROOT_GRADLE. Run Expo prebuild for Android first."
  exit 1
fi

DETOX_VERSION="$(node -p "require(require.resolve('detox/package.json')).version" 2>/dev/null || true)"
if [[ -z "$DETOX_VERSION" ]]; then
  echo "Unable to resolve installed Detox version from node_modules."
  exit 1
fi

if ! grep -q "Detox-android" "$ROOT_GRADLE"; then
  perl -0777 -i -pe "s/(allprojects\\s*\\{\\s*repositories\\s*\\{\\n)/\$1        maven {\\n            url(new File([\"node\", \"--print\", \"require.resolve('detox\\/package.json')\"].execute(null, rootDir).text.trim(), \"..\\/Detox-android\"))\\n        }\\n/s" "$ROOT_GRADLE"
fi

if ! grep -q "testBuildType System.getProperty('testBuildType', 'debug')" "$APP_GRADLE"; then
  perl -0777 -i -pe "s/defaultConfig \\{\n/defaultConfig {\n        testBuildType System.getProperty('testBuildType', 'debug')\n/s" "$APP_GRADLE"
fi

if ! grep -q "testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'" "$APP_GRADLE"; then
  perl -0777 -i -pe "s/defaultConfig \\{\n/defaultConfig {\n        testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'\n/s" "$APP_GRADLE"
fi

if grep -q "com.wix:detox" "$APP_GRADLE"; then
  perl -0777 -i -pe "s/androidTestImplementation\\('com\\.wix:detox:[^']*'\\)/androidTestImplementation('com.wix:detox:${DETOX_VERSION}')/g" "$APP_GRADLE"
else
  perl -0777 -i -pe "s/dependencies \\{\n/dependencies {\n    androidTestImplementation('com.wix:detox:${DETOX_VERSION}')\n    androidTestImplementation('androidx.test:runner:1.5.2')\n    androidTestImplementation('androidx.test:rules:1.5.0')\n    androidTestImplementation('androidx.test.ext:junit:1.1.5')\n/s" "$APP_GRADLE"
fi

MAIN_ACTIVITY_FILE="$(find android/app/src/main -name "MainActivity.*" | head -n1 || true)"
if [[ -z "$MAIN_ACTIVITY_FILE" ]]; then
  echo "MainActivity file not found under android/app/src/main."
  exit 1
fi

PACKAGE_NAME="$(
  awk '
    /^[[:space:]]*package[[:space:]]+/ {
      gsub(/^[[:space:]]*package[[:space:]]+/, "", $0)
      sub(/;.*/, "", $0)
      print
      exit
    }
  ' "$MAIN_ACTIVITY_FILE" | tr -d "\r"
)"
if [[ -z "$PACKAGE_NAME" ]]; then
  echo "Unable to read package name from $MAIN_ACTIVITY_FILE."
  exit 1
fi

PACKAGE_PATH="${PACKAGE_NAME//.//}"
LEGACY_PACKAGE_PATH="${PACKAGE_NAME//./\\/}"
ANDROID_TEST_ROOT="android/app/src/androidTest/java"
ANDROID_TEST_DIR="android/app/src/androidTest/java/$PACKAGE_PATH"
LEGACY_TEST_FILE="android/app/src/androidTest/java/$LEGACY_PACKAGE_PATH/DetoxTest.java"
TARGET_TEST_FILE="$ANDROID_TEST_DIR/DetoxTest.java"
mkdir -p "$ANDROID_TEST_ROOT"

# Remove stale escaped path artifacts like "com\\" that break Gradle/Kotlin source snapshotting.
find "$ANDROID_TEST_ROOT" -depth -mindepth 1 | while IFS= read -r path; do
  base_name="${path##*/}"
  if [[ "$base_name" == *\\* ]]; then
    rm -rf "$path"
  fi
done

mkdir -p "$ANDROID_TEST_DIR"

if [[ -f "$LEGACY_TEST_FILE" && "$LEGACY_TEST_FILE" != "$TARGET_TEST_FILE" ]]; then
  mv "$LEGACY_TEST_FILE" "$TARGET_TEST_FILE"
fi

find android/app/src/androidTest/java -name "DetoxTest.java" -type f ! -path "$TARGET_TEST_FILE" -delete
find android/app/src/androidTest/java -type d -empty -delete

cat > "$TARGET_TEST_FILE" <<EOF
package $PACKAGE_NAME;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
    @Rule
    public ActivityTestRule<MainActivity> mActivityRule = new ActivityTestRule<>(MainActivity.class, false, false);

    @Test
    public void runDetoxTests() {
        DetoxConfig detoxConfig = new DetoxConfig();
        detoxConfig.idlePolicyConfig.masterTimeoutSec = 90;
        detoxConfig.rnContextLoadTimeoutSec = 180;
        Detox.runTests(mActivityRule, detoxConfig);
    }
}
EOF

echo "Android Detox test harness configured for package $PACKAGE_NAME."
