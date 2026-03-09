import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_STORE = {
  contacts: {},
  inboundEvents: [],
  outboundEvents: [],
  statusEvents: [],
  stats: {
    dailyGlobal: {},
    recentDeliveryOutcomes: [],
  },
  killSwitch: {
    enabled: false,
    reason: "",
    updatedAt: null,
  },
};

const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_STORE));

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this._lock = Promise.resolve();
  }

  async init() {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch {
      await writeFile(this.filePath, JSON.stringify(cloneDefault(), null, 2));
    }
  }

  async read() {
    const raw = await readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...cloneDefault(), ...parsed };
  }

  async write(data) {
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async withLock(work) {
    const run = this._lock.then(work, work);
    this._lock = run.catch(() => {});
    return run;
  }

  async update(mutator) {
    return this.withLock(async () => {
      const data = await this.read();
      const next = (await mutator(data)) || data;
      await this.write(next);
      return next;
    });
  }
}
