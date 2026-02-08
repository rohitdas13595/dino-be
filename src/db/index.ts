import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://dino_user:dino_password@localhost:5432/dino_wallet";

const sql = postgres(connectionString, {
  max: 50,
  idle_timeout: 20,
  transform: {
    undefined: null,
  },
});

export default sql;
