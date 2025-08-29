# Mobile Voice Ordering System

A real-time voice ordering system that integrates Google Cloud Speech-to-Text v2 with Gemini 2.5 Flash LLM for intelligent order processing. The system supports both Korean and English voice commands with synchronized UI updates and mock payment processing.

## Features

- 🎤 **Real-time Voice Recognition** - Google Cloud Speech-to-Text v2 streaming
- 🤖 **AI-Powered Orchestration** - Gemini 2.5 Flash LLM with function calling
- 🛒 **Smart Product Management** - Intelligent product search and cart management
- 🎫 **Coupon System** - Advanced discount validation and application
- 📦 **Order Processing** - Support for pickup and delivery orders
- 💳 **Mock Payment Processing** - Secure payment simulation without real data
- 🌐 **Multi-language Support** - Korean and English language support
- 📱 **Mobile-First UI** - Responsive design with real-time synchronization

## Architecture

The system follows a microservices architecture with:

- **Voice Processing Service** - Handles audio streaming and transcription
- **LLM Orchestrator** - Routes requests and manages conversation flow
- **Business Logic Agents** - Product, Coupon, and Order management
- **UI Synchronization Service** - Real-time UI updates via WebSocket
- **Mock Payment Service** - Simulates payment processing

## Prerequisites

- Node.js 18+ 
- Docker (for deployment)
- Google Cloud Project with Speech-to-Text API enabled
- Supabase project
- Gemini API key

## Setup Instructions

### 1. Environment Configuration

Copy the environment template and fill in your credentials:

```bash
cp .env.example .env.local
```

Update `.env.local` with your actual values:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID=your_google_cloud_project_id
GOOGLE_APPLICATION_CREDENTIALS=path_to_your_service_account_key.json
GOOGLE_CLOUD_SPEECH_API_KEY=your_speech_api_key

# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key
```

### 2. Database Setup

Run the database schema setup in your Supabase project:

```sql
-- Execute the contents of supabase/schema.sql in your Supabase SQL editor
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Development

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Deployment

### Google Cloud Run Deployment

1. **Prerequisites:**
   - Install Google Cloud CLI
   - Authenticate: `gcloud auth login`
   - Set project: `gcloud config set project YOUR_PROJECT_ID`

2. **Deploy:**
   ```bash
   npm run deploy
   ```

### Docker Deployment

Build and run locally:

```bash
npm run docker:build
npm run docker:run
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── voice/         # Voice processing endpoints
│   │   ├── llm/           # LLM orchestration endpoints
│   │   ├── orders/        # Order management endpoints
│   │   ├── products/      # Product management endpoints
│   │   ├── coupons/       # Coupon management endpoints
│   │   └── payments/      # Payment processing endpoints
│   └── page.tsx           # Main application page
├── lib/
│   ├── services/          # Core services
│   ├── agents/            # Business logic agents
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   └── supabase.ts        # Supabase client configuration
└── components/            # React components
```

## API Endpoints

- `POST /api/voice/stream` - WebSocket for voice streaming
- `POST /api/llm/process` - Process user input through LLM
- `GET /api/products/search` - Search products
- `POST /api/orders/create` - Create new order
- `POST /api/coupons/validate` - Validate coupon codes
- `POST /api/payments/create` - Create mock payment session

## Development Workflow

1. **Requirements** - Defined in `.kiro/specs/mobile-voice-ordering-system/requirements.md`
2. **Design** - Detailed in `.kiro/specs/mobile-voice-ordering-system/design.md`
3. **Implementation** - Task list in `.kiro/specs/mobile-voice-ordering-system/tasks.md`

## Testing

The system includes comprehensive testing for:

- Unit tests for core services
- Integration tests for end-to-end flows
- Voice recognition accuracy testing
- Mock payment flow validation

## Security

- No real payment data is collected or stored
- All WebSocket connections use TLS encryption
- Session-based authentication with automatic expiry
- Input validation and sanitization
- Rate limiting on API endpoints

## Contributing

1. Follow the task-based development workflow
2. Implement one task at a time from the tasks.md file
3. Ensure all tests pass before submitting changes
4. Update documentation as needed

## License

This project is licensed under the MIT License.
