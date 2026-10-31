# SubscriptIQ

AI-powered Subscription Management and Revenue Operations Platform.

SubscriptIQ helps businesses manage customers, products, subscription plans, recurring billing, invoices, payments, and revenue insights from one platform. It also includes an AI assistant for querying subscription operations and supporting approved billing workflows.

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

### Backend
- Python
- FastAPI
- SQLAlchemy
- Pydantic

### Database
- Neon PostgreSQL

### AI and Automation
- Gemini API
- Model Context Protocol (MCP)
- Python AI orchestrator
- APScheduler

## Project Structure

```text
subscriptiq/
├── frontend/             # React + TypeScript application
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── core/          # Configuration, security, dependencies
│   │   ├── database/      # Database connection and base metadata
│   │   ├── models/        # SQLAlchemy database models
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── routers/       # FastAPI API routes
│   │   ├── services/      # Business logic
│   │   ├── ai/            # LLM client and orchestration
│   │   ├── mcp/           # MCP server and tools
│   │   └── automation/    # Billing and renewal scheduling
│   ├── alembic/           # Database migrations
│   ├── .env.example       # Environment variable template
│   └── requirements.txt   # Python dependencies
├── database/              # SQL seed data and database assets
└── docs/                  # API contracts and project documentation
```

## Prerequisites

Install the following:
- Python 3.11 or newer
- Node.js (LTS)
- Git
- A Neon PostgreSQL project and database
- A Gemini API key if using Gemini-powered AI features

A local PostgreSQL installation is not required when using Neon.

## Backend Setup

Run these commands from the project root.

### 1. Enter the backend directory

```bash
cd backend
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

### 3. Activate the virtual environment

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Windows Command Prompt:

```cmd
venv\Scripts\activate.bat
```

macOS/Linux:

```bash
source venv/bin/activate
```

### 4. Install Python dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Configure environment variables

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Update `.env` with your actual Neon connection string, secret key, and AI provider credentials. Never commit `.env` or share its secrets.

### 6. Start the backend

```bash
uvicorn app.main:app --reload
```

The API is available at:
- API root: http://127.0.0.1:8000/
- Interactive API documentation: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc

## Frontend Setup

Open a second terminal from the project root.

### 1. Enter the frontend directory

```bash
cd frontend
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

Vite prints the local frontend URL in the terminal (usually http://localhost:5173).

## Environment Variables

The backend `.env.example` should contain the variable names below. Replace placeholder values in your local `.env` file.

```env
APP_NAME=SubscriptIQ
APP_ENV=development
DEBUG=True

DATABASE_URL=postgresql+psycopg://username:password@host/database?sslmode=require

SECRET_KEY=replace_with_a_secure_random_secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key

FRONTEND_URL=http://localhost:5173
```

Generate a secret key with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Development Notes

- Keep database access and business rules in backend services. API routes and MCP tools should reuse those services.
- Do not let the LLM connect directly to the database.
- Perform billing calculations and validation in deterministic backend code, not in the LLM.
- Require explicit authorization and human approval for consequential actions such as creating or posting invoices.
- Prevent duplicate billing with database constraints and idempotent billing logic.
- Keep credentials in environment variables and out of source control.

## Current Project Status

This README describes the intended project setup and architecture. Update this section as implementation progresses.

## Team Workflow

- Use feature branches for parallel development.
- Agree on API request/response contracts before frontend and backend integration.
- Commit working increments frequently.
- Test the end-to-end subscription and invoice workflow before the final demo.

## License

Add the project's chosen license here before public distribution.
