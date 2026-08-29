# Makefile for ciclo cli
.PHONY: help install link test clean

help:
	@echo "Available targets:"
	@echo "  install   Install dependencies (npm)"
	@echo "  link      Link the CLI globally (npm link)"
	@echo "  test      Run unit tests (if any)"
	@echo "  clean     Remove node_modules and lockfile"
	@echo "  help      Show this help"

install:
	cd cli && npm install

link: install
	cd cli &&  npm link

test:
	# Placeholder for test command
	@echo "No tests configured yet. Add test script to package.json."

clean:
	rm -rf cli/node_modules cli/package-lock.json
	@echo "Cleaned node_modules and lockfile."