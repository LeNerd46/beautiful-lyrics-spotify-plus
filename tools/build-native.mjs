import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = path.join(root, 'src', 'native');
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', [':app:assembleRelease'], {
    cwd: native, shell: windows, stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Native release build failed (${result.status})`);
const apk = path.join(native, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
const bytes = await readFile(apk);
if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Native release build did not produce an APK ZIP archive');
}
await mkdir(path.join(root, 'dist'), { recursive: true });
await copyFile(apk, path.join(root, 'lyrics.apk'));
await copyFile(apk, path.join(root, 'dist', 'lyrics.apk'));
console.log(`Packaged native release APK (${bytes.length} bytes)`);
