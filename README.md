
A GCP cloud function deployed to be used in a Conversational Agent:
Accept an email input as a string, parse into json and save into firebase db.

Test locally:

In GCP:
Generate a service new service account private key in https://console.firebase.google.com/u/0/project/...

Save to /.../fbserviceAccountKey.json

export GOOGLE_APPLICATION_CREDENTIALS="/.../fbserviceAccountKey.json"

npm install -g firebase-tools
npm install

npx @google-cloud/functions-framework --target=processEmailAndStoreInFirebase

curl -X POST http://localhost:8080   -H "Content-Type: text/plain"   -d 'New task posted: **March 7, 2025**
**Type: Task Request, Title: Fix Broken Window, Description: Need to repair cracked window, Address: 123 Main St, Springfield, IL, 62704, Due: March 10, 2025, Budget: $150**'

