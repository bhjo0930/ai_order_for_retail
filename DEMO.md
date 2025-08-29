# Application Demo Guide

This guide provides instructions on how to set up and run a local demo of the mobile voice ordering system.

## 1. Environment Setup

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up environment variables:**
    -   Copy the `.env.local.example` file to `.env.local`.
    -   Fill in the required values for your Supabase and Google Cloud credentials. You will need:
        -   `SUPABASE_URL`
        -   `SUPABASE_ANON_KEY`
        -   `GEMINI_API_KEY`
        -   `GOOGLE_CLOUD_PROJECT_ID` (for Speech-to-Text)

## 2. Database Setup

1.  **Create a Supabase Project:** If you don't have one, create a new project in the [Supabase Dashboard](https://supabase.com/dashboard).
2.  **Run the Schema SQL:**
    -   Navigate to the **SQL Editor** in your Supabase project.
    -   Copy the contents of `supabase/schema.sql` and run it. This will create the necessary tables and policies.
3.  **Seed the Database:**
    -   In the same SQL Editor, copy the contents of `supabase/seed.sql` and run it. This will populate your database with sample products and coupons.

## 3. Running the Application

Start the Next.js development server:

```bash
npm run dev
```

Open your browser to `http://localhost:3000`. You should see the voice assistant interface.

## 4. Demo Scenarios

Here are some example conversations you can have with the assistant. Click the "Start Listening" button and speak clearly into your microphone.

### Scenario 1: Simple Order

-   **You:** "안녕하세요, 아메리카노 한 잔 주세요." (Hello, one Americano please.)
-   **Assistant:** (Should confirm the item has been added to the cart or ask for more details.)
-   **You:** "결제해주세요." (Please process the payment.)
-   **Assistant:** (Should initiate the payment process.)

### Scenario 2: Searching and Adding Multiple Items

-   **You:** "피자 뭐뭐 있나요?" (What kind of pizzas do you have?)
-   **Assistant:** (Should list the available pizzas from the database.)
-   **You:** "페퍼로니 피자 한 판이랑 콜라 두 개 주세요." (One pepperoni pizza and two colas please.)
-   **Assistant:** (Should add the items to the cart. Note: Cola is not in the seed data, so the assistant might say it's unavailable.)

### Scenario 3: Using a Coupon

-   **You:** "카페라떼 두 잔 주세요." (Two cafe lattes please.)
-   **You:** "WELCOME10 쿠폰 사용할게요." (I'd like to use the WELCOME10 coupon.)
-   **Assistant:** (Should validate the coupon and apply the discount.)
-   **You:** "주문 완료해줘." (Complete the order.)

### Scenario 4: Error Handling

-   **You:** (Mumble something unclear)
-   **Assistant:** (Should ask for clarification.)
-   **You:** "없는 상품 주문할게요." (I'd like to order a product that doesn't exist.)
-   **Assistant:** (Should inform you that the product could not be found.)

---
Enjoy the demo!
