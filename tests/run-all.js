/**
 * Test Runner
 *
 * Runs all test suites in sequence
 */

import { spawn } from "child_process";

const tests = [
  { name: "Database Constraints", file: "tests/db_constraints.test.js" },
  { name: "Ledger Service", file: "tests/ledger_service.test.js" },
  { name: "Integration Tests", file: "tests/integration.test.js" },
  { name: "Concurrent Operations", file: "tests/concurrent.test.js" },
];

const colors = {
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
  RESET: "\x1b[0m",
};

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(
      `\n${colors.CYAN}╔═══════════════════════════════════════════════════════════╗${colors.RESET}`
    );
    console.log(
      `${colors.CYAN}║  ${colors.YELLOW}${test.name.padEnd(54)}${
        colors.CYAN
      } ║${colors.RESET}`
    );
    console.log(
      `${colors.CYAN}╚═══════════════════════════════════════════════════════════╝${colors.RESET}\n`
    );

    const child = spawn("node", [test.file], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      resolve({
        name: test.name,
        success: code === 0,
      });
    });

    child.on("error", (error) => {
      console.error(
        `${colors.RED}Failed to run ${test.name}:${colors.RESET}`,
        error
      );
      resolve({
        name: test.name,
        success: false,
        error,
      });
    });
  });
}

async function runAllTests() {
  console.log(
    `${colors.BLUE}╔═══════════════════════════════════════════════════════════╗${colors.RESET}`
  );
  console.log(
    `${colors.BLUE}║                                                           ║${colors.RESET}`
  );
  console.log(
    `${colors.BLUE}║           ${colors.CYAN}ONIT Platform - Test Suite${colors.BLUE}                 ║${colors.RESET}`
  );
  console.log(
    `${colors.BLUE}║                                                           ║${colors.RESET}`
  );
  console.log(
    `${colors.BLUE}╚═══════════════════════════════════════════════════════════╝${colors.RESET}`
  );

  const startTime = Date.now();
  const results = [];

  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  console.log(
    `\n${colors.BLUE}╔═══════════════════════════════════════════════════════════╗${colors.RESET}`
  );
  console.log(
    `${colors.BLUE}║                   ${colors.YELLOW}Test Summary${colors.BLUE}                        ║${colors.RESET}`
  );
  console.log(
    `${colors.BLUE}╚═══════════════════════════════════════════════════════════╝${colors.RESET}\n`
  );

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  results.forEach((result) => {
    const icon = result.success
      ? `${colors.GREEN}✓${colors.RESET}`
      : `${colors.RED}✗${colors.RESET}`;
    const status = result.success
      ? `${colors.GREEN}PASSED${colors.RESET}`
      : `${colors.RED}FAILED${colors.RESET}`;
    console.log(`  ${icon} ${result.name.padEnd(30)} ${status}`);
  });

  console.log(`\n${colors.BLUE}Total:${colors.RESET}    ${results.length}`);
  console.log(`${colors.GREEN}Passed:${colors.RESET}   ${passed}`);
  console.log(`${colors.RED}Failed:${colors.RESET}   ${failed}`);
  console.log(`${colors.YELLOW}Duration:${colors.RESET} ${duration}s\n`);

  if (failed === 0) {
    console.log(
      `${colors.GREEN}╔═══════════════════════════════════════════════════════════╗${colors.RESET}`
    );
    console.log(
      `${colors.GREEN}║                                                           ║${colors.RESET}`
    );
    console.log(
      `${colors.GREEN}║              ✓  ALL TESTS PASSED  ✓                       ║${colors.RESET}`
    );
    console.log(
      `${colors.GREEN}║                                                           ║${colors.RESET}`
    );
    console.log(
      `${colors.GREEN}╚═══════════════════════════════════════════════════════════╝${colors.RESET}\n`
    );
    process.exit(0);
  } else {
    console.log(
      `${colors.RED}╔═══════════════════════════════════════════════════════════╗${colors.RESET}`
    );
    console.log(
      `${colors.RED}║                                                           ║${colors.RESET}`
    );
    console.log(
      `${colors.RED}║              ✗  SOME TESTS FAILED  ✗                      ║${colors.RESET}`
    );
    console.log(
      `${colors.RED}║                                                           ║${colors.RESET}`
    );
    console.log(
      `${colors.RED}╚═══════════════════════════════════════════════════════════╝${colors.RESET}\n`
    );
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error(`${colors.RED}Fatal error:${colors.RESET}`, error);
  process.exit(1);
});
