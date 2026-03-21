# PDFDiff | AI Feedback Verifier

PDFDiff is a modern, full-stack application designed to automatically verify developer implementations of PDF feedback. It uses cutting-edge AI Vision models to cross-reference Adobe Acrobat comments on an "Old PDF" against the visual layout of a "New PDF," ensuring every requested change was actually executed.

## 🚀 Key Features

- **Automated AI Verification:** Uses OpenRouter's Free Vision API (`nvidia/nemotron-nano-12b-v2-vl:free`) to visually compare snippets between document versions.
- **Threaded Comment Extraction:** Seamlessly parses Adobe Acrobat comment threads. To prevent spam, the AI only verifies comments where a developer has explicitly replied with the word `"fixed"`.
- **Lightning Fast AI Processing:** Extracts highly customized 1000px cropped image snippets instead of full pages to drop API payload sizes by 90% and parallelizes requests in chunks of 3 for instant Verification.
- **Synchronized Visual Viewer:** Features a side-by-side, perfectly synced PDF scrolling viewer to manually inspect the old and new documents.
- **Dynamic Post-Verification Reports:** Automatically generates a comprehensive "Finish & Report" interface detailing unimplemented feedback, complete with cropped snapshot evidence and the AI's reasoning.
- **Storage Optimization:** Automatically garbage-collects and deletes heavy PDF files from the Node.js server immediately after a project is closed to save disk space.

---

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, PDF.js, modern React hooks.
- **Backend:** Node.js, Express.js, `pdf-lib` (for extracting PDF metadata/annotations).
- **Database:** MongoDB (via Mongoose) to track projects and persist verification status.
- **AI Integration:** OpenAI compatible SDK pointing to OpenRouter's Vision models.

---

## 💻 Running the Application Locally

### Prerequisites
Make sure you have Node.js and MongoDB installed and running on your local machine.

### 1. Environment Variables
Create a root `.env` file and populate it with your OpenRouter credentials and MongoDB URI:
```env
OPENROUTER_API_KEY=sk-or-v1-...your-openrouter-key...
MONGODB_URI=mongodb://localhost:27017/pdfdiff
```

### 2. Install Dependencies
Install all package dependencies via npm:
```bash
npm install
```

### 3. Run the Development Servers
You will need to run both the Frontend and the Backend servers. Open two separate terminal windows.

**Terminal 1 (Backend):**
```bash
npm run server
# or manually: npx tsx server/index.ts
```

**Terminal 2 (Frontend):**
```bash
npm run dev
```

Your app will be automatically served at `http://localhost:5173`!

---

## 💡 Workflow Guide
1. Export a document from Adobe Acrobat containing your visual markup/feedback.
2. The developer fixes the document and replies `"fixed"` inside the Acrobat comment thread.
3. Upload both the Old Feedback PDF and the New Clean PDF into PDFDiff.
4. Click **Verify All**. The app crops the documents and sends the snippets to the AI.
5. Click **Finish & Report** to generate a printable PDF summary of anything the developer missed!
