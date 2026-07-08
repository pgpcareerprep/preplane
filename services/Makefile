.PHONY: test-contracts test-contracts-py test-contracts-rust build-frontend compose-up health-check

test-contracts: test-contracts-rust test-contracts-py

test-contracts-rust:
	cd services && cargo test -p preplane-contracts

test-contracts-py:
	cd services/contracts/python && pip install -q -e ".[dev]" && pytest -q

build-frontend:
	npm run build

compose-up:
	cd services/infra && docker compose up -d --build

health-check:
	@for port in 8080 8081 8082 8083 8090 9001 9002; do \
	  echo "==> :$$port"; \
	  curl -sf "http://localhost:$$port/health" || exit 1; \
	done
