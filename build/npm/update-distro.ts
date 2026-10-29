/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const rootPath = resolve(import.meta.dirname, '..', '..', '..');
const docodePath = join(rootPath, 'docode');
const distroPath = join(rootPath, 'docode-distro');
const commit = execSync('git rev-parse HEAD', { cwd: distroPath, encoding: 'utf8' }).trim();
const packageJsonPath = join(docodePath, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

packageJson.distro = commit;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
