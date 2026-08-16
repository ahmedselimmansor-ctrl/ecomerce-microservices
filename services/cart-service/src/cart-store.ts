import { Redis } from 'ioredis';

export interface CartItem {
  sku: string;
  quantity: number;
  addedAt: string;
}

export interface Cart {
  id: string;
  owner: 'user' | 'guest';
  items: CartItem[];
  updatedAt: string;
}

const USER_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 يومًا
const GUEST_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 يومًا
const MAX_DISTINCT_ITEMS = 100;
const MAX_QUANTITY_PER_ITEM = 20;

/**
 * السلة في Redis لا في قاعدة بيانات علائقية.
 *
 * <p>السبب: السلة تُقرأ وتُكتب عند كل نقرة تقريبًا، وبياناتها قابلة للفقد
 * (فقدان سلة مزعج لا كارثي)، ولها انتهاء صلاحية طبيعي. هذا بالضبط ما يجيده
 * Redis وما يُهدر في PostgreSQL.
 *
 * <p>البنية: Hash لكل سلة، الحقل = sku والقيمة = JSON للسطر.
 * تعديل صنف واحد لا يتطلب قراءة السلة كلها وكتابتها (مما يمنع lost updates).
 */
export class CartStore {
  constructor(private readonly redis: Redis) {}

  private key(owner: 'user' | 'guest', id: string): string {
    return owner === 'user' ? `cart:user:${id}` : `cart:guest:${id}`;
  }

  private ttl(owner: 'user' | 'guest'): number {
    return owner === 'user' ? USER_TTL_SECONDS : GUEST_TTL_SECONDS;
  }

  async get(owner: 'user' | 'guest', id: string): Promise<Cart> {
    const key = this.key(owner, id);
    const raw = await this.redis.hgetall(key);

    const items: CartItem[] = Object.entries(raw)
      .filter(([field]) => field !== '__meta')
      .map(([, value]) => JSON.parse(value) as CartItem)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));

    return {
      id,
      owner,
      items,
      updatedAt: raw['__meta'] ?? new Date().toISOString(),
    };
  }

  async addItem(
    owner: 'user' | 'guest',
    id: string,
    sku: string,
    quantity: number,
  ): Promise<Cart> {
    const key = this.key(owner, id);
    const existingRaw = await this.redis.hget(key, sku);

    const distinct = await this.redis.hlen(key);
    if (!existingRaw && distinct >= MAX_DISTINCT_ITEMS) {
      throw new CartError('CART_FULL', `Cart cannot hold more than ${MAX_DISTINCT_ITEMS} items`);
    }

    const existing = existingRaw ? (JSON.parse(existingRaw) as CartItem) : null;
    const newQuantity = Math.min(
      (existing?.quantity ?? 0) + quantity,
      MAX_QUANTITY_PER_ITEM,
    );

    const item: CartItem = {
      sku,
      quantity: newQuantity,
      addedAt: existing?.addedAt ?? new Date().toISOString(),
    };

    // خط أنابيب واحد: كتابة + بيانات وصفية + تجديد الصلاحية في رحلة شبكة واحدة
    await this.redis
      .pipeline()
      .hset(key, sku, JSON.stringify(item))
      .hset(key, '__meta', new Date().toISOString())
      .expire(key, this.ttl(owner))
      .exec();

    return this.get(owner, id);
  }

  async setQuantity(
    owner: 'user' | 'guest',
    id: string,
    sku: string,
    quantity: number,
  ): Promise<Cart> {
    const key = this.key(owner, id);

    if (quantity <= 0) {
      return this.removeItem(owner, id, sku);
    }

    const existingRaw = await this.redis.hget(key, sku);
    if (!existingRaw) {
      throw new CartError('ITEM_NOT_IN_CART', `Item ${sku} is not in the cart`);
    }

    const existing = JSON.parse(existingRaw) as CartItem;
    const item: CartItem = {
      ...existing,
      quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
    };

    await this.redis
      .pipeline()
      .hset(key, sku, JSON.stringify(item))
      .hset(key, '__meta', new Date().toISOString())
      .expire(key, this.ttl(owner))
      .exec();

    return this.get(owner, id);
  }

  async removeItem(owner: 'user' | 'guest', id: string, sku: string): Promise<Cart> {
    const key = this.key(owner, id);
    await this.redis
      .pipeline()
      .hdel(key, sku)
      .hset(key, '__meta', new Date().toISOString())
      .expire(key, this.ttl(owner))
      .exec();
    return this.get(owner, id);
  }

  async clear(owner: 'user' | 'guest', id: string): Promise<void> {
    // UNLINK لا DEL: الحذف يتم في خيط خلفي فلا يحجب Redis
    await this.redis.unlink(this.key(owner, id));
  }

  /**
   * دمج سلة الضيف في سلة المستخدم عند تسجيل الدخول.
   *
   * <p>قاعدة الدمج: نأخذ الكمية الأكبر لا مجموعها. لو أضاف المستخدم نفس
   * المنتج كضيف ثم كمستخدم، فهو يريد واحدًا لا اثنين.
   */
  async merge(guestToken: string, userId: string): Promise<Cart> {
    const guestKey = this.key('guest', guestToken);
    const userKey = this.key('user', userId);

    const guestRaw = await this.redis.hgetall(guestKey);
    const guestItems = Object.entries(guestRaw).filter(([f]) => f !== '__meta');

    if (guestItems.length === 0) {
      return this.get('user', userId);
    }

    const userRaw = await this.redis.hgetall(userKey);
    const pipeline = this.redis.pipeline();

    for (const [sku, value] of guestItems) {
      const guestItem = JSON.parse(value) as CartItem;
      const userItemRaw = userRaw[sku];
      const userItem = userItemRaw ? (JSON.parse(userItemRaw) as CartItem) : null;

      const merged: CartItem = {
        sku,
        quantity: Math.min(
          Math.max(guestItem.quantity, userItem?.quantity ?? 0),
          MAX_QUANTITY_PER_ITEM,
        ),
        addedAt: userItem?.addedAt ?? guestItem.addedAt,
      };
      pipeline.hset(userKey, sku, JSON.stringify(merged));
    }

    pipeline.hset(userKey, '__meta', new Date().toISOString());
    pipeline.expire(userKey, USER_TTL_SECONDS);
    pipeline.unlink(guestKey);
    await pipeline.exec();

    return this.get('user', userId);
  }
}

export class CartError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'CartError';
  }
}
