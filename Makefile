################################################################################
# Target: all                                                                 #
################################################################################
PGPASSWORD ?= postgres
TEST_SUITE ?= "(cloud|local)"

.PHONY: all
all: test

.PHONY: install
install:
	yarn install

.PHONY: test
test: install
	cd test/scripts && docker compose up -d
	@sleep 5
	@PGPASSWORD="${PGPASSWORD}" psql -h localhost -U postgres -d testdb < test/scripts/setup-data-postgresql.sql
