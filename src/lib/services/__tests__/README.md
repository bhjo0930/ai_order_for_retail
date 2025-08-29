# Testing Framework and Demo Scenarios

This directory contains comprehensive unit tests and integration tests for the mobile voice ordering system, covering all core services and end-to-end flows as specified in task 9 of the implementation plan.

## Test Structure

### Unit Tests (`__tests__/`)

#### Core Services
- **`voice-processing.test.ts`** - Tests for Google Cloud Speech-to-Text v2 integration
  - Audio stream management
  - Korean language configuration
  - Network connectivity handling
  - Error recovery mechanisms
  - Audio quality assessment

- **`simple-unit.test.ts`** - Basic unit test examples demonstrating testing patterns
  - Mock functions
  - Async operations
  - Error handling
  - Object and array testing
  - Korean text processing

#### Business Logic Agents (`../agents/__tests__/`)
- **`product-agent.test.ts`** - Product search, cart management, and inventory
  - Product catalog search with filters
  - Cart operations (add, update, remove)
  - Inventory management
  - Product recommendations
  - Korean product name handling

- **`coupon-agent.test.ts`** - Coupon validation and discount calculation
  - Coupon code validation
  - Discount type handling (percentage, fixed, free shipping)
  - Stacking rules enforcement
  - Restriction checking
  - Korean coupon messages

- **`order-agent.test.ts`** - Order creation and payment processing
  - Pickup and delivery order flows
  - Customer information validation
  - Payment session management
  - Order status tracking
  - Korean address handling

### Integration Tests (`__tests__/integration/`)

#### End-to-End Flows
- **`complete-flow.test.ts`** - Comprehensive integration test demonstrating:
  - Complete pickup order flow from voice to confirmation
  - Complete delivery order flow with address and payment
  - Error recovery scenarios and edge cases
  - Korean language processing and responses

- **`pickup-order-flow.test.ts`** - Detailed pickup order integration
  - Voice input → LLM processing → Product search → Cart → Order → Payment
  - Service coordination and state management
  - UI synchronization events

- **`delivery-order-flow.test.ts`** - Detailed delivery order integration
  - Delivery address handling
  - Delivery fee calculation
  - Coupon application
  - Status progression through delivery states

- **`error-recovery.test.ts`** - Error handling and recovery scenarios
  - Voice recognition failures
  - Network connectivity issues
  - LLM processing errors
  - Payment failures
  - Business logic errors

- **`korean-language.test.ts`** - Korean language processing
  - Korean speech recognition configuration
  - Natural language understanding
  - Response generation with honorifics
  - Number and address parsing
  - Mixed Korean-English handling

## Test Coverage

### Requirements Covered

**Requirement 10.1** - Complete pickup order flow testing
- Voice input processing
- Product search and selection
- Order creation and confirmation
- Payment processing simulation

**Requirement 10.2** - Complete delivery order flow testing
- Address collection and validation
- Delivery fee calculation
- Order status progression
- Korean address formats

**Requirement 10.3** - Error recovery and edge cases
- Network connectivity failures
- Voice recognition errors
- Payment processing failures
- Invalid input handling

**Requirement 10.4** - Demo data and scenarios
- Sample product catalogs
- Mock payment processing
- Korean language examples
- Various order types

**Requirement 10.5** - System monitoring and logging
- Error tracking and categorization
- Performance metrics simulation
- State transition validation

**Requirement 10.6** - Korean language processing
- Korean speech patterns
- Honorific usage
- Number parsing
- Address formatting

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Files
```bash
# Unit tests
npm test -- --run src/lib/services/__tests__/simple-unit.test.ts

# Integration tests
npm test -- --run src/lib/services/__tests__/integration/complete-flow.test.ts

# Specific service tests
npm test -- --run src/lib/agents/__tests__/product-agent.test.ts
```

### Test with Coverage
```bash
npm test -- --coverage
```

## Mock Strategy

The tests use comprehensive mocking to isolate components:

- **External APIs**: Google Cloud Speech-to-Text, Gemini 2.5 Flash
- **Database Services**: Product, Session, Order, Coupon services
- **WebSocket Handlers**: UI synchronization events
- **Payment Processing**: Mock payment service with configurable outcomes

## Demo Scenarios

The integration tests serve as executable specifications demonstrating:

1. **Happy Path Flows**
   - Successful pickup orders
   - Successful delivery orders
   - Coupon application
   - Payment completion

2. **Error Scenarios**
   - Network failures with recovery
   - Invalid input handling
   - Payment failures with retry
   - Product unavailability

3. **Korean Language Features**
   - Voice recognition in Korean
   - Natural language understanding
   - Appropriate response generation
   - Cultural considerations (honorifics, politeness)

## Test Data

Tests use realistic Korean data:
- Product names in Korean and mixed Korean-English
- Korean addresses and phone numbers
- Korean currency formatting (KRW)
- Korean customer names and information
- Korean error messages and responses

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- No external dependencies (all mocked)
- Fast execution (< 1 second per test file)
- Clear pass/fail criteria
- Comprehensive error reporting

## Future Enhancements

Potential additions for expanded testing:
- Performance benchmarking tests
- Load testing for concurrent sessions
- Real API integration tests (with test credentials)
- Visual regression tests for UI components
- Accessibility testing for Korean screen readers