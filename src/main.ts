import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import path from 'path';
import semverGt from 'semver/functions/gt';
import semverCoerce from 'semver/functions/coerce';
import { AppModule } from './app.module';

const MIN_NODE_VERSION = '24.10.0';
const MIN_PNPM_VERSION = '10.18.3';
const MIN_PYTHON_VERSION = '3.10.0';

async function bootstrap() {
  checkEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });
  const viewsDir = path.join(process.cwd(), 'views');
  app.setBaseViewsDir(viewsDir);
  app.setViewEngine('hbs');
  app.useStaticAssets(viewsDir);
  app.useStaticAssets(path.join(process.cwd(), 'public'), { prefix: '/static/' });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`HTTP service listening on port ${port}`);
}

function checkEnvironment(): void {
  ensureNodeVersion();
  ensurePnpmVersion();
  ensurePythonVersion();
}

function ensureNodeVersion(): void {
  const current = semverCoerce(process.version)?.version;
  if (!current || semverGt(MIN_NODE_VERSION, current)) {
    throw new Error(`Node.js ${MIN_NODE_VERSION}+ is required. Current: ${process.version}`);
  }
}

function ensurePnpmVersion(): void {
  try {
    const { execSync } = require('child_process');
    const output = execSync('pnpm --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const version = semverCoerce(output)?.version;
    if (version && semverGt(MIN_PNPM_VERSION, version)) {
      throw new Error(`pnpm ${MIN_PNPM_VERSION}+ is required. Current: ${output}`);
    }
  } catch {
    // pnpm not installed or not in use; skip the check.
  }
}

function ensurePythonVersion(): void {
  const pythonOverride = process.env.PYTHON_VERSION;
  if (pythonOverride) {
    const coerced = semverCoerce(pythonOverride)?.version;
    if (coerced && semverGt(MIN_PYTHON_VERSION, coerced)) {
      console.warn(
        `Detected PYTHON_VERSION=${pythonOverride}, which is older than ${MIN_PYTHON_VERSION}. yt-dlp will fall back to the embedded binary.`,
      );
    }
    return;
  }

  try {
    const { execSync } = require('child_process');
    const versionOutput = execSync('python3 --version', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const match = versionOutput.match(/python\s+([0-9.]+)/i);
    if (match?.[1]) {
      const version = semverCoerce(match[1])?.version;
      if (version && semverGt(MIN_PYTHON_VERSION, version)) {
        console.warn(
          `python3 --version reports ${match[1]}, which is older than ${MIN_PYTHON_VERSION}. yt-dlp will fall back to the embedded binary.`,
        );
      }
    }
  } catch (error) {
    console.warn(
      'Python runtime could not be detected automatically. Please ensure Python >= 3.10 is available for yt-dlp.',
    );
  }
}

void bootstrap();
