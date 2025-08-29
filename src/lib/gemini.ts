import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionDeclarationSchema, FunctionDeclarationsTool } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not defined in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// Define the function declarations for the tools
const searchCatalog: FunctionDeclarationSchema = {
  name: "search_catalog",
  description: "Search for products in the catalog based on a query.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query for the product." },
    },
    required: ["query"],
  },
};

const addToCart: FunctionDeclarationSchema = {
  name: "add_to_cart",
  description: "Add a product to the user's shopping cart.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The ID of the product to add." },
      quantity: { type: "number", description: "The quantity of the product to add." },
    },
    required: ["productId", "quantity"],
  },
};

const validateCoupon: FunctionDeclarationSchema = {
    name: "validate_coupon",
    description: "Validate a coupon code.",
    parameters: {
        type: "object",
        properties: {
            code: { type: "string", description: "The coupon code to validate." },
        },
        required: ["code"],
    },
};

const createOrder: FunctionDeclarationSchema = {
    name: "create_order",
    description: "Create an order with the items in the cart.",
    parameters: {
        type: "object",
        properties: {
            orderType: { type: "string", enum: ["pickup", "delivery"], description: "The type of order." },
            deliveryAddress: { type: "string", description: "The delivery address, if applicable." },
        },
        required: ["orderType"],
    },
};

const initiatePayment: FunctionDeclarationSchema = {
    name: "initiate_payment",
    description: "Initiate the payment process for the current order.",
    parameters: {
        type: "object",
        properties: {
            orderId: { type: "string", description: "The ID of the order to pay for." },
        },
        required: ["orderId"],
    },
};


// Create a tool that includes all the function declarations
const tools: FunctionDeclarationsTool[] = [{
  functionDeclarations: [
    searchCatalog,
    addToCart,
    validateCoupon,
    createOrder,
    initiatePayment,
  ],
}];

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  // A system instruction is a way to provide context and instructions to the model
  // that will be prepended to every prompt.
  systemInstruction: "You are a friendly and helpful assistant for a mobile voice ordering system. Your goal is to help users order products, apply coupons, and complete their purchase. You should be conversational and guide the user through the process. You can use the available tools to perform actions like searching for products, adding items to the cart, and creating orders.",
  tools,
});

export const processUserInput = async (text: string, history: any[]) => {
  const chat = model.startChat({
    history,
    // The safety settings are used to block harmful content.
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ],
  });

  const result = await chat.sendMessage(text);
  const response = result.response;

  return response.candidates?.[0].content;
};
