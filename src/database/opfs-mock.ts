class MockWritable {
  private chunks: Uint8Array[] = [];

  constructor(private onClose: (data: Uint8Array) => void) {}

  async write(data: ArrayBuffer | Uint8Array) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    this.chunks.push(bytes);
  }

  async close() {
    const len = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    this.onClose(out);
  }
}

class MockFileHandle {
  private data = new Uint8Array(0);

  async createWritable() {
    return new MockWritable((d) => {
      this.data = new Uint8Array(d);
    });
  }

  async getFile() {
    const data = this.data;
    return {
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  }
}

export class MockDirectoryHandle {
  private dirs = new Map<string, MockDirectoryHandle>();
  private files = new Map<string, MockFileHandle>();

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MockDirectoryHandle> {
    if (!this.dirs.has(name)) {
      if (!opts?.create) throw new DOMException(`${name} not found`, 'NotFoundError');
      this.dirs.set(name, new MockDirectoryHandle());
    }
    return this.dirs.get(name)!;
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MockFileHandle> {
    if (!this.files.has(name)) {
      if (!opts?.create) throw new DOMException(`${name} not found`, 'NotFoundError');
      this.files.set(name, new MockFileHandle());
    }
    return this.files.get(name)!;
  }

  async removeEntry(name: string, _opts?: { recursive?: boolean }): Promise<void> {
    this.dirs.delete(name);
    this.files.delete(name);
  }
}

export function installOPFSMock(): MockDirectoryHandle {
  const root = new MockDirectoryHandle();
  Object.defineProperty(global.navigator, 'storage', {
    value: { getDirectory: () => Promise.resolve(root) },
    writable: true,
    configurable: true,
  });
  return root;
}
