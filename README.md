# Tesla Vision Monorepo

A scalable React + TypeScript and FastAPI monorepo for a premium camera operations dashboard.
The frontend includes a dark glassmorphism command center, responsive navigation, animated status
cards, and live camera controls for webcam and phone-camera workflows.

## Structure

```text
apps/
  backend/    FastAPI service
  frontend/   React + TypeScript app powered by Vite
infra/
  docker/     Service Dockerfiles
```

## Delivered Phases

- Phase 1: monorepo foundation, Docker Compose, Git-ready structure, ESLint, Prettier,
  environment examples, and development scripts.
- Phase 2: futuristic dark dashboard with glass panels, sidebar, top navigation, animated
  metric cards, responsive layout, and status bar.
- Phase 3: live camera UI with webcam access, rear phone camera mode, camera switching,
  fullscreen preview, FPS display, resolution selector, and calibration controls.
- Phase 4: browser-side video pipeline with a bounded frame queue, frame buffering,
  worker-thread manager, async processing, and performance telemetry.
- Phase 5: object detection overlay for car, bus, truck, bicycle, motorcycle, pedestrian,
  dog, traffic light, and stop sign classes.
- Phase 6: multi-object tracking with stable IDs, velocity, direction, lifetime, and
  motion prediction markers.
- Phase 7: lane detection overlay for left, center, and right lanes plus road boundaries.

## Prerequisites

- Node.js 20+
- Python 3.12+
- Docker Desktop, optional but recommended

## Environment

Copy `.env.example` to `.env` and adjust values as needed.

## Development

Install frontend dependencies:

```bash
npm install
```

Create the backend virtual environment and install dependencies:

```bash
cd apps/backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Run both apps with Docker:

```bash
docker compose up --build
```

Run locally:

```bash
npm run dev:frontend
npm run dev:backend
```

## Scripts

- `npm run dev` starts frontend and backend through Docker Compose.
- `npm run dev:frontend` starts the Vite frontend.
- `npm run dev:backend` starts the FastAPI backend.
- `npm run lint` runs ESLint for the frontend.
- `npm run format` runs Prettier across the repo.
- `npm run typecheck` runs TypeScript checks.
- `npm run test:backend` runs the FastAPI test suite.
