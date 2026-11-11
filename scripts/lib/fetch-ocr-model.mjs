import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { BuildModelConfig } from './build-model-config.mjs';
import { ReadTarEntries } from './read-tar-entries.mjs';

// A model name becomes a folder name, so it may not leave models_dir.
const MODEL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MODEL_ROLES = new Set(['detection', 'recognition']);
const HTTPS_PREFIX = 'https://';
const MODEL_FILE_NAME = 'inference.onnx';
const YAML_FILE_NAME = 'inference.yml';
const CONFIG_FILE_NAME = 'config.json';
const SOURCE_FILE_NAME = 'model-source.json';
const PARTIAL_SUFFIX = '.partial';
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

function IsValidModelEntry(model) {
  return (
    typeof model === 'object' &&
    model !== null &&
    typeof model.name === 'string' &&
    MODEL_NAME_PATTERN.test(model.name) &&
    !model.name.includes('..') &&
    MODEL_ROLES.has(model.role) &&
    typeof model.url === 'string' &&
    model.url.startsWith(HTTPS_PREFIX) &&
    Number.isSafeInteger(model.size_bytes) &&
    model.size_bytes > 0 &&
    typeof model.sha256 === 'string' &&
    SHA256_PATTERN.test(model.sha256)
  );
}

async function IsModelUpToDate(model_dir, sha256) {
  try {
    const source = JSON.parse(
      await readFile(path.join(model_dir, SOURCE_FILE_NAME), 'utf8')
    );

    if (source?.sha256 !== sha256) return false;

    await access(path.join(model_dir, MODEL_FILE_NAME));
    await access(path.join(model_dir, CONFIG_FILE_NAME));

    return true;
  } catch {
    return false;
  }
}

function VerifyArchive(model, archive_bytes) {
  if (archive_bytes.length !== model.size_bytes) {
    throw new Error(
      `Size mismatch: expected ${model.size_bytes} bytes, got ${archive_bytes.length}.`
    );
  }

  const sha256 = createHash('sha256').update(archive_bytes).digest('hex');

  if (sha256 !== model.sha256) throw new Error('SHA-256 mismatch.');
}

function ExtractModel(model, archive_bytes) {
  const entry_dir = `${model.name}_onnx_infer`;
  const model_entry_name = `${entry_dir}/${MODEL_FILE_NAME}`;
  const yaml_entry_name = `${entry_dir}/${YAML_FILE_NAME}`;
  const entries = ReadTarEntries(archive_bytes, [
    model_entry_name,
    yaml_entry_name
  ]);
  const config = BuildModelConfig(
    TEXT_DECODER.decode(entries.get(yaml_entry_name)),
    model.role
  );

  if (config.model_name !== model.name) {
    throw new Error(`The config names ${config.model_name} instead.`);
  }

  return { model_bytes: entries.get(model_entry_name), config };
}

// Files go to <name>.partial first; model-source.json, the up-to-date marker,
// is written last, and the folder is renamed into place only when complete.
async function WriteModel(model, model_dir, { model_bytes, config }) {
  const partial_dir = `${model_dir}${PARTIAL_SUFFIX}`;
  const source_record = { url: model.url, sha256: model.sha256 };

  await rm(partial_dir, { recursive: true, force: true });
  await mkdir(partial_dir, { recursive: true });
  await writeFile(path.join(partial_dir, MODEL_FILE_NAME), model_bytes);
  await writeFile(
    path.join(partial_dir, CONFIG_FILE_NAME),
    `${JSON.stringify(config)}\n`
  );
  await writeFile(
    path.join(partial_dir, SOURCE_FILE_NAME),
    `${JSON.stringify(source_record, null, 2)}\n`
  );
  await rm(model_dir, { recursive: true, force: true });
  await rename(partial_dir, model_dir);
}

/**
 * Downloads, verifies, and unpacks one model into models_dir/<name>, unless
 * its recorded checksum already matches (spec 0002 §5.3).
 */
export async function FetchOcrModel(model, { models_dir, DownloadModel }) {
  if (!IsValidModelEntry(model)) {
    throw new Error(`Invalid model entry: ${JSON.stringify(model)}`);
  }

  const model_dir = path.join(models_dir, model.name);

  if (await IsModelUpToDate(model_dir, model.sha256)) return 'skipped';

  try {
    const archive_bytes = await DownloadModel(model.url);

    VerifyArchive(model, archive_bytes);
    await WriteModel(model, model_dir, ExtractModel(model, archive_bytes));

    return 'downloaded';
  } catch (error) {
    await rm(`${model_dir}${PARTIAL_SUFFIX}`, { recursive: true, force: true });

    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`${model.name}: ${reason}`, { cause: error });
  }
}
