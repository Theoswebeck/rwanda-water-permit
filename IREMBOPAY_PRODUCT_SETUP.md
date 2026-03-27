# 🎯 IremboPay Product Setup - REQUIRED

## 🚨 Current Issue: PRODUCT_NOT_FOUND

The IremboPay API is **working correctly** ✅, but you need to create the product in your IremboPay dashboard.

---

## ✅ Solution: Create Product in IremboPay Dashboard

### Step 1: Login to IremboPay Dashboard
👉 https://dashboard.irembopay.com/auth/login

### Step 2: Navigate to Products/Services Section
Look for:
- **Products** menu
- **Services** menu  
- **Billing** → **Products**
- Or similar section

### Step 3: Create New Product
Click "Add Product" or "Create Service" and fill in:

```
Product Code: WATER_PERMIT_FEE
Product Name: Water Permit Application Fee
Price: 50 RWF
Currency: RWF
Description: Water permit application processing fee (non-refundable)
Category: Government Services / Permits
Status: Active
```

### Step 4: Save and Test
After creating the product, test again in Postman or your app!

---

## 🔄 Alternative: Use Existing Product Code

If you already have products set up in IremboPay:

### Option A: Check Existing Products
1. Go to IremboPay Dashboard → Products
2. Find the product code you want to use
3. Update `.env.local`:
   ```bash
   IREMBOPAY_PRODUCT_CODE=YOUR_EXISTING_CODE
   ```

### Option B: Ask IremboPay Support
Contact support and ask:
- "What product codes exist in my account?"
- "Can you create a product with code WATER_PERMIT_FEE for water permit fees?"

---

## 📝 Current Configuration

Your `.env.local` now has:
```bash
IREMBOPAY_PRODUCT_CODE=WATER_PERMIT_FEE
IREMBOPAY_ACCOUNT_ID=RWANDA_WATER_BOARD
```

**To change the product code:**
1. Edit `.env.local`
2. Update `IREMBOPAY_PRODUCT_CODE=NEW_CODE`
3. Restart server: `npm run dev`

---

## 🧪 Test in Postman (Current Working Format)

**URL:** `POST https://api.irembopay.com/payments/payment/initiate`

**Headers:**
```
Authorization: Bearer sk_live_fa1c55c194b249aea7a3cbc93bebb36b
Content-Type: application/json
Accept: */*
irembopay-secret: sk_live_fa1c55c194b249aea7a3cbc93bebb36b
X-API-Version: 2
```

**Body:**
```json
{
  "transactionId": "TEST-123456",
  "paymentItems": [
    {
      "code": "YOUR_PRODUCT_CODE_HERE",
      "name": "Water Permit Application Fee",
      "quantity": 1,
      "unitAmount": 50
    }
  ],
  "paymentAccountIdentifier": "RWANDA_WATER_BOARD",
  "description": "Water Permit Application Fee",
  "customer": {
    "email": "test@example.com",
    "phone": "+250788123456",
    "name": "Test User"
  },
  "language": "EN"
}
```

---

## ✅ Once Product is Created

When the product exists in IremboPay:

1. **Test in Postman** - Should get `success: true`
2. **Test in App** - Click "Proceed to Payment"
3. **Should see** - IremboPay payment widget loads
4. **Complete payment** - Test the full flow

---

## Progress So Far

✅ IremboPay API credentials working  
✅ Correct request format  
✅ Correct headers  
✅ Code fully updated  
❌ **ONLY MISSING:** Product creation in IremboPay dashboard

**You're 95% done! Just create the product and everything will work!** 🚀


