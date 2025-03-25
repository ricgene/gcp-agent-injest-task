// Combined solution with email parsing and Firebase storage
import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';
import functions from '@google-cloud/functions-framework';

// For ES modules, get the current file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if running locally or in the cloud
const isLocalExecution = process.argv[1] === fileURLToPath(import.meta.url);
console.log(`Running in ${isLocalExecution ? 'local' : 'cloud'} mode`);

// Configure credentials based on environment
let serviceAccount;
try {
  if (isLocalExecution) {
    // Only try to load from file in local environment
    const credentialsPath = join(__dirname, '../../fbserviceAccountKey-admin.json');
    console.log(`Loading credentials from local file: ${credentialsPath}`);
    serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    console.log('Credentials loaded successfully from file');
  } else {
    // In cloud environment, we'll use application default credentials
    console.log('Cloud environment detected, using application default credentials');
    serviceAccount = undefined;
  }
} catch (error) {
  console.error('Error loading credentials:', error.message);
  console.log('Falling back to application default credentials');
  serviceAccount = undefined;
}


// Initialize Firebase Admin SDK
let firebaseApp;
try {
  // Use cert if we have explicit credentials, otherwise use applicationDefault
  if (serviceAccount) {
    // Initialize without a name to make it the default app
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Initialized Firebase Admin with explicit credentials');
  } else {
    // When deployed to Cloud Functions, use application default credentials
    firebaseApp = admin.initializeApp();
    console.log('Initialized Firebase Admin with application default credentials');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  throw error;
}

// Get Firestore instance from the initialized app
const db = admin.firestore();

// Store data function
async function storeDataInFirebase(data) {
  console.log("Attempting to store data:", JSON.stringify(data));

  try {
    const dataWithTimestamp = {
      ...data,
      timestamp: data.timestamp || admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("conversations").add(dataWithTimestamp);
    console.log("Document written with ID:", docRef.id);
    return docRef;
  } catch (error) {
    console.error("Error storing data in Firebase:", error);
    throw error;
  }
}

// Email parsing function
function parseEmailData(emailText) {
  // Extract the timestamp
  const timestampMatch = emailText.match(/New task posted: \*\*([^*]+)\*\*/);
  const timestamp = timestampMatch ? timestampMatch[1] : null;
  
  // Extract the type line
  const typeLineMatch = emailText.match(/\*\*Type: ([^*]+)\*\*/);
  const typeLine = typeLineMatch ? 
    `Type: ${typeLineMatch[1]}` : 
    emailText.split('\n').find(line => line.includes('Type:'));
  
  // Parse the type line to extract individual fields
  let taskDetails = {};
  if (typeLine) {
    // Extract title
    const titleMatch = typeLine.match(/Title: ([^,]+)/);
    if (titleMatch) taskDetails.title = titleMatch[1].trim();
    
    // Extract description
    const descMatch = typeLine.match(/Description: ([^,]+)/);
    if (descMatch) taskDetails.description = descMatch[1].trim();
    
    // Extract address
    const addressMatch = typeLine.match(/Address: ([^,]+,[^,]+,[^,]+)/);
    if (addressMatch) taskDetails.address = addressMatch[1].trim();
    
    // Extract due date
    const dueMatch = typeLine.match(/Due: ([^,]+)/);
    if (dueMatch) taskDetails.dueDate = dueMatch[1].trim();
    
    // Extract budget
    const budgetMatch = typeLine.match(/Budget: \$(\d+)/);
    if (budgetMatch) taskDetails.budget = parseInt(budgetMatch[1]);
  }
  
  // Create the JSON structure expected by the function
  return {
    customerRequest: {
      customerId: "task-" + Date.now(),
      requestType: "task_creation",
      productId: taskDetails.title || "No Title",
      urgency: "medium",
      preferredLanguage: "en-US"
    },
    customerContext: {
      loyaltyTier: "standard",
      previousInteractions: 0,
      taskData: {
        timestamp: timestamp,
        typeLine: typeLine,
        details: taskDetails
      }
    }
  };
}

// Process function used by both cloud and local execution
async function processRequest(inputData) {
  let jsonData;
  
  // STEP 1: Process the email/input to JSON
  if (typeof inputData === 'string' && inputData.includes('New task posted:')) {
    // Parse email data into proper JSON structure
    jsonData = parseEmailData(inputData);
  } else {
    // Use the JSON data as provided
    jsonData = inputData;
  }
  
  // Validate JSON structure
  if (!jsonData.customerRequest || !jsonData.customerContext) {
    throw new Error('Invalid JSON structure');
  }

  // STEP 2: Store in Firebase
  // Prepare data structure for Firestore
  const dataToStore = {
    type: 'EMAIL_PROCESSED',
    inputData: jsonData,
    timestamp: new Date().toISOString(),
    processed: true
  };
  
  // Store in Firebase
  const docRef = await storeDataInFirebase(dataToStore);
  
  return {
    success: true,
    message: "Email processed and data stored in Firebase successfully",
    requestId: docRef.id,
    parsedData: jsonData
  };
}

// Register the HTTP function with the Functions Framework
functions.http('processEmailAndStoreInFirebase', async (req, res) => {
  try {
    console.log("Cloud function request received");
    
    const result = await processRequest(req.body);
    res.status(200).json(result);
    
  } catch (error) {
    console.error("Error in cloud function:", error);
    res.status(500).json({
      success: false,
      message: "Error processing request",
      error: error.message
    });
  }
});

// For local testing
if (isLocalExecution) {
  const runLocalTest = async () => {
    try {
      console.log("Starting local test...");
      
      // Sample email data for testing
      const testEmailData = `New task posted: **2023-05-15T14:30:00**
      
**Type: Title: Fix leaky faucet, Description: The bathroom sink is leaking, Address: 123 Main St, New York, NY 10001, Due: 2023-05-20, Budget: $150**

Please respond if you're interested in taking this task.`;
      
      // Process the test data
      const result = await processRequest(testEmailData);
      console.log("Local test result:", JSON.stringify(result, null, 2));
      
      // Alternatively, test with JSON data
      const testJsonData = {
        customerRequest: {
          customerId: "test-customer-123",
          requestType: "task_creation",
          productId: "Test Task",
          urgency: "high",
          preferredLanguage: "en-US"
        },
        customerContext: {
          loyaltyTier: "premium",
          previousInteractions: 5,
          taskData: {
            details: {
              title: "Test Task",
              description: "This is a test task",
              address: "123 Test St, Test City, Test State",
              dueDate: "2023-06-01",
              budget: 200
            }
          }
        }
      };
      
      console.log("\nTesting with JSON data:");
      const jsonResult = await processRequest(testJsonData);
      console.log("JSON test result:", JSON.stringify(jsonResult, null, 2));
      
    } catch (error) {
      console.error("Error in local test:", error);
    }
  };
  
  runLocalTest().then(() => console.log("Local testing complete"));
}