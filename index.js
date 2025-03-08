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

// Configure credentials
let serviceAccount;
try {
  // Only try to load from file in development environment
  if (process.env.NODE_ENV === 'development') {
    serviceAccount = JSON.parse(
      readFileSync(join(__dirname, './firebase-admin-creds.json'), 'utf8')
    );
    console.log('Loaded credentials from local file (development mode)');
  } else {
    // In production, we'll use application default credentials
    console.log('Using application default credentials (production mode)');
    serviceAccount = undefined;
  }
} catch (error) {
  console.log('Note: No local credentials file found, using default credentials');
  serviceAccount = undefined;
}

// Initialize Firebase Admin SDK
try {
  // Use cert if we have explicit credentials, otherwise use applicationDefault
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    }, 'admin-app');
    console.log('Initialized Firebase Admin with explicit credentials');
  } else {
    // When deployed to Cloud Functions, use application default credentials
    admin.initializeApp();
    console.log('Initialized Firebase Admin with application default credentials');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  throw error;
}

// Get Firestore instance
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

// Register the HTTP function with the Functions Framework
functions.http('processEmailAndStoreInFirebase', async (req, res) => {
  try {
    console.log("Combined email processing and Firebase storage request received");
    
    let jsonData;
    
    // STEP 1: Process the email/input to JSON
    if (typeof req.body === 'string' && req.body.includes('New task posted:')) {
      // Parse email data into proper JSON structure
      jsonData = parseEmailData(req.body);
    } else {
      // Use the JSON data as provided
      jsonData = req.body;
    }
    
    // Validate JSON structure
    if (!jsonData.customerRequest || !jsonData.customerContext) {
      res.status(400).send('Invalid JSON structure');
      return;
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
    
    // STEP 3: Return response
    res.status(200).json({
      success: true,
      message: "Email processed and data stored in Firebase successfully",
      requestId: docRef.id,
      parsedData: jsonData
    });
    
  } catch (error) {
    console.error("Error in combined function:", error);
    res.status(500).json({
      success: false,
      message: "Error processing request",
      error: error.message
    });
  }
});

// For local testing
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("Starting local test...");
  // Add test code here if needed
}