# 🛒 MyDealBazaar Backend API

Production-ready E-Commerce Backend built with **Node.js, Express.js, MongoDB, JWT Authentication, Razorpay Payments, Cloudinary, AI Negotiation System, Guest Cart, Wishlist, and Order Management**.

---

## 🚀 Features

### 🔐 Authentication & Authorization
- User Registration
- User Login
- JWT Authentication
- Google Authentication
- Protected Routes
- Role-Based Access Control (Admin/User)

### 🛍 Product Management
- Create Products
- Update Products
- Delete Products
- Product Search
- Product Filtering
- Product Sorting
- Featured Products

### ❤️ Wishlist
- Add to Wishlist
- Remove from Wishlist
- View Wishlist

### 🛒 Cart System
- Add to Cart
- Update Quantity
- Remove Items
- Persistent User Cart

### 👤 Guest Shopping
- Guest Cart Support
- Guest Product Chat

### 📦 Order Management
- Create Orders
- Order History
- User Orders
- Order Tracking Support

### 🤖 AI Negotiation System
- Product Price Negotiation
- AI Chat-Based Bargaining
- Dynamic Discount Logic

### 💳 Payment Gateway
- Razorpay Integration
- Order Verification
- Payment Verification
- Email Confirmation

### ☁️ Cloud Storage
- Cloudinary Image Upload
- Product Image Management

### 📧 Email Services
- Resend Email Integration
- Order Confirmation Emails

### 🛡 Security
- Helmet
- CORS Protection
- Rate Limiting
- Mongo Sanitize
- Error Handling Middleware

---

# 🛠 Tech Stack

## Backend
- Node.js
- Express.js
- MongoDB
- Mongoose

## Authentication
- JWT
- Google OAuth

## Payments
- Razorpay

## Storage
- Cloudinary

## Email
- Resend

## Security
- Helmet
- Express Rate Limit
- Mongo Sanitize

---

# 📂 Project Structure

```bash
backend/
│
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── utils/
├── views/
├── payments/
├── negotiation/
├── Cloudinary/
│
├── server.js
├── package.json
└── README.md
```

---

# ⚙️ Installation

### Clone Repository

```bash
git clone https://github.com/your-username/mydealbazaar-backend.git

cd mydealbazaar-backend
```

### Install Dependencies

```bash
npm install
```

### Create Environment File

Create a `.env` file in root directory.

```env
PORT=1300

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

CLIENT_URL=http://localhost:5173

GOOGLE_CLIENT_ID=your_google_client_id

RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

RESEND_API_KEY=your_resend_api_key
```

---

# ▶️ Run Project

Development Mode

```bash
npm run dev
```

Production Mode

```bash
npm start
```

---

# 📡 API Endpoints

## Authentication

```http
POST /api/auth/signup
POST /api/auth/login
```

## Products

```http
GET /api/products
GET /api/products/:id
POST /api/products
PUT /api/products/:id
DELETE /api/products/:id
```

## Cart

```http
GET /api/cart
POST /api/cart
DELETE /api/cart/:id
```

## Wishlist

```http
GET /api/wishlist
POST /api/wishlist
DELETE /api/wishlist/:id
```

## Orders

```http
GET /api/orders
POST /api/orders
```

## Negotiation

```http
POST /api/negotiate/:id/start
POST /api/ai-negotiate/:productId/message
```

## Payment

```http
POST /api/payment/create-order
POST /api/payment/verify-payment
```

---

# ❤️ Highlights

✅ JWT Authentication

✅ Google Login

✅ Razorpay Payments

✅ AI Price Negotiation

✅ Guest Cart

✅ Wishlist

✅ Cloudinary Uploads

✅ Order Management

✅ Secure REST APIs

---

# 📈 Future Improvements

- Coupon System
- Product Reviews
- Real-Time Notifications
- Admin Analytics Dashboard
- Multi-Vendor Support
- Recommendation Engine

---

# 👨‍💻 Author

**Rahul Koli**
**Mohd. Waliul**
Full Stack Developer

Built with ❤️ using Node.js, Express.js & MongoDB
