################################################################################
# Target: all                                                                 #
################################################################################
PGPASSWORD ?= password
TEST_SUITE ?= "(cloud|local)"

.PHONY: all
all: test

.PHONY: install
install:
	yarn install

.PHONY: test
test: install
	cd test/scripts && docker compose up -d
	@sleep 1
	@PGPASSWORD="${PGPASSWORD}" psql -h localhost -U postgres -d testdb < test/scripts/setup-data-postgresql.sql
	cd test/scripts && spice run &> spice.log &
	-yarn test -t ${TEST_SUITE}
	@killall spice || true
	@cd test/scripts && docker compose down