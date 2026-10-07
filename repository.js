// データレイヤー: リポジトリパターン。
// server.js はこのインターフェース (list/get/create/delete/updateQuantity) だけに依存する。
// DB などに差し替える場合は同じメソッドを持つクラスを作って server.js で差し替えるだけでよい。

const normalizeName = (s) => s.normalize('NFKC').trim().toLowerCase();

class ProductRepository {
  async findByName(name) { throw new Error('not implemented'); }
  async list() { throw new Error('not implemented'); }
  async get(id) { throw new Error('not implemented'); }
  async create(data) { throw new Error('not implemented'); }
  async delete(id) { throw new Error('not implemented'); }
  async updateQuantity(id, quantity) { throw new Error('not implemented'); }
}

class InMemoryProductRepository extends ProductRepository {
  constructor(seed = []) {
    super();
    this.items = new Map();
    this.nextId = 1;
    seed.forEach((p) => this.create(p));
  }

  async list() {
    return [...this.items.values()].map((p) => ({ ...p }));
  }

  async get(id) {
    const p = this.items.get(id);
    return p ? { ...p } : null;
  }

  // 全角半角・大文字小文字・前後空白の違いを無視して同名商品を探す
  async findByName(name) {
    const key = normalizeName(name);
    for (const p of this.items.values()) {
      if (normalizeName(p.name) === key) return { ...p };
    }
    return null;
  }

  async create({ name, quantity }) {
    const product = { id: this.nextId++, name, quantity, updatedAt: new Date().toISOString() };
    this.items.set(product.id, product);
    return { ...product };
  }

  async delete(id) {
    return this.items.delete(id);
  }

  async updateQuantity(id, quantity) {
    const p = this.items.get(id);
    if (!p) return null;
    p.quantity = quantity;
    p.updatedAt = new Date().toISOString();
    return { ...p };
  }
}

module.exports = { ProductRepository, InMemoryProductRepository };
