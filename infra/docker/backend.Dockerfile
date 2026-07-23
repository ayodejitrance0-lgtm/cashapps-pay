FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/apps/backend

COPY apps/backend/pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY apps/backend ./

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

