.PHONY: up down db migrate api web test-python test-dotnet build-web lint-web etl
up:
	docker compose --profile app up --build -d

db:
	docker compose up -d --wait postgis

migrate:
	docker compose --profile etl run --build --rm migrate

down:
	docker compose down

api:
	dotnet run --project backend/src/ChapaTuChoro.Api --launch-profile http

web:
	cd frontend && npm run dev

test-dotnet:
	dotnet test backend/ChapaTuChoro.slnx

test-python:
	python -m unittest discover -s ingestion/tests -v

build-web:
	cd frontend && npm run build

lint-web:
	cd frontend && npm run lint && npm run format:check

etl:
	docker compose --profile etl run --build --rm etl
