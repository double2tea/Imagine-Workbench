import { spawnSync } from "node:child_process";

function runDockerComposeCheck(label, args) {
  console.log(`Checking ${label} Docker Compose config...`);
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error) {
    console.error(`Docker Compose check failed for ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runDockerComposeCheck("personal", ["compose", "config", "--quiet"]);
runDockerComposeCheck("team", ["compose", "--env-file", ".env.team.example", "-f", "docker-compose.team.yml", "config", "--quiet"]);

console.log("Docker Compose checks passed.");
