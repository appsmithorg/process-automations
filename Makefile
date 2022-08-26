sync-github-project-issues:
	if [[ -f .env ]]; then set -a && . .env && set +a; fi; \
		yarn run ts-node "src/$@.ts" "$${PROJECT-DevOps Pod}"

sync-contributors:
	if [[ -f .env ]]; then set -a && . .env && set +a; fi; \
		yarn run ts-node "src/$@.ts"
