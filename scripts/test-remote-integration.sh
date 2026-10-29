#!/usr/bin/env bash
set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

DOCODEUSERDATADIR=`mktemp -d 2>/dev/null`
DOCODECRASHDIR=$ROOT/.build/crashes
DOCODELOGSDIR=$ROOT/.build/logs/integration-tests-remote
TESTRESOLVER_DATA_FOLDER=`mktemp -d 2>/dev/null`

cd $ROOT

# Names the suite that is running, so that a failure that stops the script
# (set -e) reports which suite failed and with which exit code.
CURRENT_SUITE=""
start_suite() {
	CURRENT_SUITE="$1"
	echo
	echo "### $1"
	echo
}
report_failed_suite() {
	local status=$?
	if [[ $status -ne 0 && -n "$CURRENT_SUITE" ]]; then
		echo "Integration tests failed in '$CURRENT_SUITE' with exit code $status." >&2
		if [[ "$GITHUB_ACTIONS" == "true" ]]; then
			echo "::error title=Integration tests failed::'$CURRENT_SUITE' exited with code $status"
		fi
	fi
}
trap report_failed_suite EXIT

if [[ "$1" == "" ]]; then
	AUTHORITY=docode-remote://test+test
	EXT_PATH=$ROOT/extensions
	# Load remote node
	npm run gulp node
else
	AUTHORITY=$1
	EXT_PATH=$2
	DOCODEUSERDATADIR=${3:-$DOCODEUSERDATADIR}
fi

export REMOTE_DOCODE=$AUTHORITY$EXT_PATH

# Figure out which Electron to use for running tests
if [ -z "$INTEGRATION_TEST_ELECTRON_PATH" ]
then
	INTEGRATION_TEST_ELECTRON_PATH="./scripts/code.sh"

	# No extra arguments when running out of sources
	EXTRA_INTEGRATION_TEST_ARGUMENTS=""

	echo "Running remote integration tests out of sources."
else
	export DOCODE_CLI=1
	export ELECTRON_ENABLE_LOGGING=1

	# Running from a build, we need to enable the docode-test-resolver extension
	EXTRA_INTEGRATION_TEST_ARGUMENTS="--extensions-dir=$EXT_PATH  --enable-proposed-api=docode.docode-test-resolver --enable-proposed-api=docode.docode-api-tests"

	echo "Running remote integration tests with $INTEGRATION_TEST_ELECTRON_PATH as build."
fi

export TESTRESOLVER_DATA_FOLDER=$TESTRESOLVER_DATA_FOLDER
export TESTRESOLVER_LOGS_FOLDER=$DOCODELOGSDIR/server

# Figure out which remote server to use for running tests
if [ -z "$DOCODE_REMOTE_SERVER_PATH" ]
then
	echo "Using remote server out of sources for integration tests"
else
	echo "Using $DOCODE_REMOTE_SERVER_PATH as server path for integration tests"
	export TESTRESOLVER_INSTALL_BUILTIN_EXTENSION='ms-vscode.vscode-smoketest-check'
fi

if [ -z "$INTEGRATION_TEST_APP_NAME" ]; then
	kill_app() { true; }
else
	kill_app() { killall $INTEGRATION_TEST_APP_NAME || true; }
fi

API_TESTS_EXTRA_ARGS="--disable-telemetry --disable-experiments --skip-welcome --skip-release-notes --crash-reporter-directory=$DOCODECRASHDIR --logsPath=$DOCODELOGSDIR --no-cached-data --disable-updates --use-inmemory-secretstorage --disable-workspace-trust --user-data-dir=$DOCODEUSERDATADIR"

echo "Storing crash reports into '$DOCODECRASHDIR'."
echo "Storing log files into '$DOCODELOGSDIR'."


# Tests in the extension host

start_suite "API tests (folder)"
"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_DOCODE/docode-api-tests/testWorkspace --extensionDevelopmentPath=$REMOTE_DOCODE/docode-api-tests --extensionTestsPath=$REMOTE_DOCODE/docode-api-tests/out/singlefolder-tests $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

start_suite "API tests (workspace)"
"$INTEGRATION_TEST_ELECTRON_PATH" --file-uri=$REMOTE_DOCODE/docode-api-tests/testworkspace.code-workspace --extensionDevelopmentPath=$REMOTE_DOCODE/docode-api-tests --extensionTestsPath=$REMOTE_DOCODE/docode-api-tests/out/workspace-tests $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

start_suite "TypeScript tests"
"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_DOCODE/typescript-language-features/test-workspace --extensionDevelopmentPath=$REMOTE_DOCODE/typescript-language-features --extensionTestsPath=$REMOTE_DOCODE/typescript-language-features/out/test/unit $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

start_suite "Markdown tests"
"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_DOCODE/markdown-language-features/test-workspace --extensionDevelopmentPath=$REMOTE_DOCODE/markdown-language-features --extensionTestsPath=$REMOTE_DOCODE/markdown-language-features/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

start_suite "Emmet tests"
"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$REMOTE_DOCODE/emmet/test-workspace --extensionDevelopmentPath=$REMOTE_DOCODE/emmet --extensionTestsPath=$REMOTE_DOCODE/emmet/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

start_suite "Git tests"
"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$AUTHORITY$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$REMOTE_DOCODE/git --extensionTestsPath=$REMOTE_DOCODE/git/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

start_suite "Ipynb tests"
"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$AUTHORITY$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$REMOTE_DOCODE/ipynb --extensionTestsPath=$REMOTE_DOCODE/ipynb/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

start_suite "Configuration editing tests"
"$INTEGRATION_TEST_ELECTRON_PATH" --folder-uri=$AUTHORITY$(mktemp -d 2>/dev/null) --extensionDevelopmentPath=$REMOTE_DOCODE/configuration-editing --extensionTestsPath=$REMOTE_DOCODE/configuration-editing/out/test $API_TESTS_EXTRA_ARGS $EXTRA_INTEGRATION_TEST_ARGUMENTS
kill_app

# Cleanup

if [[ "$3" == "" ]]; then
	rm -rf $DOCODEUSERDATADIR
fi

rm -rf $TESTRESOLVER_DATA_FOLDER
