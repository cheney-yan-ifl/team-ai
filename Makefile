SHELL := /bin/bash

.PHONY: dev frontend backend compose-up compose-down fmt

dev: compose-up

frontend:
	cd frontend && npm install && npm run dev

backend:
	cd backend && FLASK_APP=app.py flask run --host=0.0.0.0 --port=19001 --debug

compose-up:
	docker-compose up --build

compose-down:
	docker-compose down

fmt:
	cd backend && black .
