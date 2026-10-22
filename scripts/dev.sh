#!/bin/bash
# Dev server startup script — explicitly unsets DATABASE_URL so the .env
# file's value is the one Prisma sees (otherwise a stale shell env var
# overrides what dotenv loads from .env).
unset DATABASE_URL
cd /home/z/my-project
exec npx next dev
