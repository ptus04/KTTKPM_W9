import { useState, useEffect, useCallback } from 'react';
import './App.css';

// API Configuration - Gateway (điểm vào duy nhất)
const GATEWAY = 'http://localhost:8080/api';

// Simulated userId (in production, this comes from auth)
const USER_ID = 'user_flash_sale_001';

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({ items: [], total: 0, count: 0 });
  const [orders, setOrders] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('products');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [stockMap, setStockMap] = useState({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [flashTimer, setFlashTimer] = useState({ hours: 2, minutes: 30, seconds: 0 });

  // Flash Sale countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setFlashTimer((prev) => {
        let { hours, minutes, seconds } = prev;
        if (seconds > 0) {
          seconds--;
        } else if (minutes > 0) {
          minutes--;
          seconds = 59;
        } else if (hours > 0) {
          hours--;
          minutes = 59;
          seconds = 59;
        }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Show notification
  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Load products from PU1
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${GATEWAY}/products`);
      const json = await res.json();
      setProducts(json.data || []);
      console.log(`📦 Products loaded from: ${json.source}`);
    } catch (error) {
      console.error('Error loading products:', error);
      showNotification('Không thể tải sản phẩm!', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  // Load all stock from PU4
  const loadStock = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/stock`);
      const json = await res.json();
      const map = {};
      (json.data || []).forEach((item) => {
        map[item.productId] = item.stock;
      });
      setStockMap(map);
    } catch (error) {
      console.error('Error loading stock:', error);
    }
  }, []);

  // Load cart from PU2
  const loadCart = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/cart?userId=${USER_ID}`);
      const json = await res.json();
      setCart(json.data || { items: [], total: 0, count: 0 });
    } catch (error) {
      console.error('Error loading cart:', error);
    }
  }, []);

  // Load orders from PU3
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/orders?userId=${USER_ID}`);
      const json = await res.json();
      setOrders(json.data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadProducts();
    loadStock();
    loadCart();
  }, [loadProducts, loadStock, loadCart]);

  // Add to cart via PU2
  const addToCart = async (product) => {
    try {
      const res = await fetch(`${GATEWAY}/cart/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: USER_ID,
          productId: product.id,
          quantity: 1,
          name: product.name,
          price: product.price,
          image: product.image,
        }),
      });
      const json = await res.json();
      setCart(json.data || { items: [], total: 0, count: 0 });
      showNotification(`✅ Đã thêm "${product.name}" vào giỏ hàng!`);
    } catch (error) {
      console.error('Error adding to cart:', error);
      showNotification('Lỗi khi thêm vào giỏ hàng!', 'error');
    }
  };

  // Remove from cart
  const removeFromCart = async (productId) => {
    try {
      const res = await fetch(`${GATEWAY}/cart/${productId}?userId=${USER_ID}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      setCart(json.data || { items: [], total: 0, count: 0 });
      showNotification('🗑️ Đã xóa khỏi giỏ hàng');
    } catch (error) {
      console.error('Error removing from cart:', error);
      showNotification('Lỗi khi xóa khỏi giỏ hàng!', 'error');
    }
  };

  // Checkout via PU3
  const checkout = async () => {
    if (cart.items.length === 0) {
      showNotification('Giỏ hàng trống!', 'error');
      return;
    }

    try {
      setCheckoutLoading(true);
      const res = await fetch(`${GATEWAY}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID }),
      });
      const json = await res.json();

      if (res.ok) {
        showNotification(`🎉 Đặt hàng thành công! Mã đơn: ${json.data.orderId.slice(0, 8)}...`);
        setCart({ items: [], total: 0, count: 0 });
        // Reload stock (giảm real-time)
        await loadStock();
        await loadOrders();
        setActiveTab('orders');
      } else {
        showNotification(json.error || 'Lỗi đặt hàng!', 'error');
      }
    } catch (error) {
      console.error('Error checkout:', error);
      showNotification('Lỗi khi đặt hàng!', 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Format VND currency
  const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(price);
  };

  // Format time
  const pad = (n) => n.toString().padStart(2, '0');

  return (
    <div className="app">
      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <h1>FLASH SALE</h1>
            <span className="badge-space">Space-Based Architecture</span>
          </div>
          <div className="flash-timer">
            <span className="timer-label">Kết thúc sau:</span>
            <div className="timer-digits">
              <span className="digit">{pad(flashTimer.hours)}</span>
              <span className="separator">:</span>
              <span className="digit">{pad(flashTimer.minutes)}</span>
              <span className="separator">:</span>
              <span className="digit">{pad(flashTimer.seconds)}</span>
            </div>
          </div>
          <nav className="nav-tabs">
            <button
              id="tab-products"
              className={`tab ${activeTab === 'products' ? 'active' : ''}`}
              onClick={() => { setActiveTab('products'); loadProducts(); loadStock(); }}
            >
              🛍️ Sản phẩm
            </button>
            <button
              id="tab-cart"
              className={`tab ${activeTab === 'cart' ? 'active' : ''}`}
              onClick={() => { setActiveTab('cart'); loadCart(); }}
            >
              🛒 Giỏ hàng
              {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
            </button>
            <button
              id="tab-orders"
              className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => { setActiveTab('orders'); loadOrders(); }}
            >
              📦 Đơn hàng
            </button>
          </nav>
        </div>
      </header>

      {/* Architecture Banner */}
      <div className="arch-banner">
        <div className="arch-item gateway">
          <span className="arch-icon">🌐</span>
          <span>Gateway<br /><small>:8080</small></span>
        </div>
        <div className="arch-arrow">→</div>
        <div className="arch-item">
          <span className="arch-icon">🔲</span>
          <span>PU1 Product<br /><small>:8081</small></span>
        </div>
        <div className="arch-item">
          <span className="arch-icon">🛒</span>
          <span>PU2 Cart<br /><small>:8082</small></span>
        </div>
        <div className="arch-item">
          <span className="arch-icon">📋</span>
          <span>PU3 Order<br /><small>:8083</small></span>
        </div>
        <div className="arch-item">
          <span className="arch-icon">📊</span>
          <span>PU4 Inventory<br /><small>:8084</small></span>
        </div>
        <div className="arch-arrow">↔</div>
        <div className="arch-item redis">
          <span className="arch-icon">🟥</span>
          <span>Redis<br /><small>Data Grid</small></span>
        </div>
      </div>

      {/* Main Content */}
      <main className="main">
        {/* Product List */}
        {activeTab === 'products' && (
          <div className="products-page">
            <div className="section-header">
              <h2>⚡ Flash Sale - Giá Sốc Hôm Nay</h2>
              <button className="refresh-btn" onClick={() => { loadProducts(); loadStock(); }}>
                🔄 Làm mới
              </button>
            </div>

            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>Đang tải từ Data Grid...</p>
              </div>
            ) : (
              <div className="product-grid">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="product-card"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <div className="product-badge">FLASH SALE</div>
                    <div className="product-image">{product.image}</div>
                    <div className="product-info">
                      <h3 className="product-name">{product.name}</h3>
                      <span className="product-category">{product.category}</span>
                      <div className="product-price">
                        <span className="price-original">
                          {formatPrice(product.price * 1.3)}
                        </span>
                        <span className="price-sale">{formatPrice(product.price)}</span>
                      </div>
                      <div className="stock-bar">
                        <div
                          className="stock-fill"
                          style={{
                            width: `${Math.min(((stockMap[product.id] || 0) / 100) * 100, 100)}%`,
                          }}
                        ></div>
                        <span className="stock-text">
                          Còn {stockMap[product.id] ?? '...'} sản phẩm
                        </span>
                      </div>
                      <button
                        id={`add-to-cart-${product.id}`}
                        className="btn-add-cart"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product);
                        }}
                        disabled={(stockMap[product.id] || 0) <= 0}
                      >
                        {(stockMap[product.id] || 0) <= 0 ? 'Hết hàng' : '🛒 Thêm vào giỏ'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Product Detail Modal */}
        {selectedProduct && (
          <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedProduct(null)}>✕</button>
              <div className="modal-body">
                <div className="modal-image">{selectedProduct.image}</div>
                <div className="modal-info">
                  <span className="product-category">{selectedProduct.category}</span>
                  <h2>{selectedProduct.name}</h2>
                  <p className="modal-desc">{selectedProduct.description}</p>
                  <div className="product-price">
                    <span className="price-original">{formatPrice(selectedProduct.price * 1.3)}</span>
                    <span className="price-sale">{formatPrice(selectedProduct.price)}</span>
                    <span className="discount-badge">-23%</span>
                  </div>
                  <div className="modal-stock">
                    📦 Tồn kho: <strong>{stockMap[selectedProduct.id] ?? '...'}</strong> sản phẩm
                  </div>
                  <div className="modal-source">
                    📡 Nguồn dữ liệu: <code>Data Grid (Redis)</code>
                  </div>
                  <button
                    className="btn-add-cart large"
                    onClick={() => {
                      addToCart(selectedProduct);
                      setSelectedProduct(null);
                    }}
                    disabled={(stockMap[selectedProduct.id] || 0) <= 0}
                  >
                    {(stockMap[selectedProduct.id] || 0) <= 0 ? '❌ Hết hàng' : '🛒 Thêm vào giỏ hàng'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cart */}
        {activeTab === 'cart' && (
          <div className="cart-page">
            <div className="section-header">
              <h2>🛒 Giỏ hàng của bạn</h2>
              <span className="data-source">Data Grid: PU2 Cart (:8082)</span>
            </div>

            {cart.items.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🛒</span>
                <h3>Giỏ hàng trống</h3>
                <p>Hãy thêm sản phẩm Flash Sale vào giỏ hàng!</p>
                <button className="btn-primary" onClick={() => setActiveTab('products')}>
                  🛍️ Mua sắm ngay
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.items.map((item) => (
                    <div key={item.productId} className="cart-item">
                      <div className="cart-item-image">{item.image}</div>
                      <div className="cart-item-info">
                        <h3>{item.name}</h3>
                        <p className="cart-item-price">{formatPrice(item.price)}</p>
                        <p className="cart-item-qty">Số lượng: {item.quantity}</p>
                      </div>
                      <div className="cart-item-total">
                        <span>{formatPrice(item.price * item.quantity)}</span>
                        <button
                          className="btn-remove"
                          onClick={() => removeFromCart(item.productId)}
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cart-summary">
                  <div className="summary-row">
                    <span>Tổng sản phẩm:</span>
                    <span>{cart.count} sản phẩm</span>
                  </div>
                  <div className="summary-row total">
                    <span>Tổng thanh toán:</span>
                    <span className="total-price">{formatPrice(cart.total)}</span>
                  </div>
                  <button
                    id="btn-checkout"
                    className="btn-checkout"
                    onClick={checkout}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? (
                      <>
                        <div className="spinner-small"></div>
                        Đang xử lý...
                      </>
                    ) : (
                      '⚡ Đặt hàng ngay'
                    )}
                  </button>
                  <p className="checkout-note">
                    ⚡ Xử lý trực tiếp trên Data Grid - Không chờ DB
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Orders */}
        {activeTab === 'orders' && (
          <div className="orders-page">
            <div className="section-header">
              <h2>📦 Đơn hàng của bạn</h2>
              <span className="data-source">Data Grid: PU3 Order (:8083)</span>
            </div>

            {orders.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📦</span>
                <h3>Chưa có đơn hàng</h3>
                <p>Hãy mua sắm và đặt hàng Flash Sale!</p>
                <button className="btn-primary" onClick={() => setActiveTab('products')}>
                  🛍️ Mua sắm ngay
                </button>
              </div>
            ) : (
              <div className="orders-list">
                {orders.map((order) => (
                  <div key={order.id} className="order-card">
                    <div className="order-header">
                      <div>
                        <span className="order-id">🆔 {order.id.slice(0, 8)}...</span>
                        <span className={`order-status ${order.status}`}>
                          {order.status === 'confirmed' ? '✅ Đã xác nhận' : order.status}
                        </span>
                      </div>
                      <span className="order-date">
                        📅 {new Date(order.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <div className="order-items">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="order-item">
                          <span>{item.image} {item.name}</span>
                          <span>x{item.quantity} — {formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="order-total">
                      <span>Tổng:</span>
                      <span className="total-price">{formatPrice(order.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <p>⚡ Flash Sale System — Space-Based Architecture Demo</p>
          <div className="footer-arch">
            <span>Frontend (React) → API Gateway → PU1 Product / PU2 Cart / PU3 Order / PU4 Inventory → Redis Data Grid</span>
          </div>
          <p className="footer-note">Không phụ thuộc Database • Dữ liệu trên Memory Grid • Low Latency</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
