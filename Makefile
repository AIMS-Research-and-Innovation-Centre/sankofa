.PHONY: bootstrap dev seed verify smoke clean ui ui-build ui-test deploy

bootstrap:
	cp -n .env.example .env || true
	docker compose up -d
	@echo "⏳ waiting for neo4j..."
	@sleep 15
	pip install -e ".[dev]"
	@echo "✅ ready. next: make seed"

dev:
	uvicorn sankofa.api.app:app --reload --port 8001

seed:
	python scripts/seed_demo.py

verify:
	bash scripts/verify.sh

smoke:
	python scripts/smoke_test.py

clean:
	docker compose down -v
	rm -f data/events.ndjson data/audit.ndjson

ui:
	cd frontend && npm run dev

ui-build:
	cd frontend && npm run build

ui-test:
	cd frontend && npm test

deploy:
	docker compose -f deploy/compose.yml up -d --build
