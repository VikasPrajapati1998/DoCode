# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

docode_copilot_link_path=/usr/bin/copilot
docode_copilot_link_code_target=/usr/share/code/bin/copilot-shim/copilot
docode_copilot_link_code_insiders_target=/usr/share/code-insiders/bin/copilot-shim/copilot

docode_copilot_link_warn() {
	printf '%s\n' "warning: docode_copilot_link: $1" >&2
}

docode_copilot_link_read_target() {
	docode_copilot_link_read_path=$1
	docode_copilot_link_read_target=

	if [ ! -L "$docode_copilot_link_read_path" ]; then
		return 1
	fi

	if ! docode_copilot_link_read_target=$(readlink -n -- "$docode_copilot_link_read_path" && printf x); then
		docode_copilot_link_warn "could not inspect symbolic link $docode_copilot_link_read_path"
		return 1
	fi

	docode_copilot_link_read_target=${docode_copilot_link_read_target%x}
	return 0
}

docode_copilot_link_is_usable() {
	[ -f "$1" ] && [ -x "$1" ]
}

# Whether an edition should provide the command. A DEB records the choice in debconf; RPM has no equivalent, so it
# always does unless the CopilotCliCommand policy turns the command off.
docode_copilot_link_wanted() {
	if command -v db_get >/dev/null 2>&1 && db_get "$1/add-copilot-command" && [ "$RET" = false ]; then
		return 1
	fi

	return 0
}

# Sets docode_copilot_link_policy to allowed, disabled, or unknown using the shim's own policy reader, which exits with
# 0 or 10. Unknown means the shim is missing, can't run, or predates the policy command.
docode_copilot_link_query_policy() {
	docode_copilot_link_policy=unknown

	if ! docode_copilot_link_is_usable "$1"; then
		return 0
	fi

	# Keep the shim off standard input, which debconf uses for its protocol.
	if "$1" --docode-shim policy </dev/null >/dev/null 2>&1; then
		docode_copilot_link_policy=allowed
	else
		docode_copilot_link_policy_status=$?
		if [ "$docode_copilot_link_policy_status" -eq 10 ]; then
			docode_copilot_link_policy=disabled
		fi
	fi

	return 0
}

docode_copilot_link_cleanup_temporary() {
	docode_copilot_link_cleanup_status=0

	if [ "$docode_copilot_link_temporary_link_created" = true ] && [ -L "$docode_copilot_link_temporary_link" ]; then
		if docode_copilot_link_read_target "$docode_copilot_link_temporary_link" && [ "$docode_copilot_link_read_target" = "$docode_copilot_link_new_target" ]; then
			if ! rm -f -- "$docode_copilot_link_temporary_link"; then
				docode_copilot_link_warn "$docode_copilot_link_operation: failed to remove temporary link $docode_copilot_link_temporary_link"
				docode_copilot_link_cleanup_status=1
			fi
		else
			docode_copilot_link_warn "$docode_copilot_link_operation: temporary link $docode_copilot_link_temporary_link changed before cleanup; preserving it"
			docode_copilot_link_cleanup_status=1
		fi
	elif [ -e "$docode_copilot_link_temporary_link" ]; then
		docode_copilot_link_warn "$docode_copilot_link_operation: temporary path $docode_copilot_link_temporary_link is no longer an owned symbolic link; preserving it"
		docode_copilot_link_cleanup_status=1
	fi

	if [ -d "$docode_copilot_link_temporary_directory" ]; then
		if ! rmdir -- "$docode_copilot_link_temporary_directory"; then
			docode_copilot_link_warn "$docode_copilot_link_operation: failed to remove temporary directory $docode_copilot_link_temporary_directory"
			docode_copilot_link_cleanup_status=1
		fi
	elif [ -e "$docode_copilot_link_temporary_directory" ] || [ -L "$docode_copilot_link_temporary_directory" ]; then
		docode_copilot_link_warn "$docode_copilot_link_operation: temporary path $docode_copilot_link_temporary_directory is no longer an owned directory; preserving it"
		docode_copilot_link_cleanup_status=1
	fi

	return "$docode_copilot_link_cleanup_status"
}

docode_copilot_link_replace_recognized() {
	docode_copilot_link_new_target=$1
	docode_copilot_link_expected_target=$2
	docode_copilot_link_operation=$3
	docode_copilot_link_temporary_directory=
	docode_copilot_link_temporary_link=
	docode_copilot_link_temporary_link_created=false

	if ! docode_copilot_link_temporary_directory=$(mktemp -d "${docode_copilot_link_path}.docode-copilot.XXXXXX"); then
		docode_copilot_link_warn "$docode_copilot_link_operation: failed to create a temporary directory beside $docode_copilot_link_path while selecting $docode_copilot_link_new_target"
		return 1
	fi

	docode_copilot_link_temporary_link=$docode_copilot_link_temporary_directory/copilot
	if ! ln -s -T -- "$docode_copilot_link_new_target" "$docode_copilot_link_temporary_link"; then
		docode_copilot_link_warn "$docode_copilot_link_operation: failed to create temporary link $docode_copilot_link_temporary_link"
		docode_copilot_link_cleanup_temporary || :
		return 1
	fi
	docode_copilot_link_temporary_link_created=true

	if ! docode_copilot_link_read_target "$docode_copilot_link_path"; then
		docode_copilot_link_warn "$docode_copilot_link_operation: could not recheck $docode_copilot_link_path before replacement; preserving it"
		docode_copilot_link_cleanup_temporary || :
		return 1
	fi

	if [ "$docode_copilot_link_read_target" != "$docode_copilot_link_expected_target" ]; then
		docode_copilot_link_warn "$docode_copilot_link_operation: $docode_copilot_link_path changed before replacement; preserving it"
		docode_copilot_link_cleanup_temporary || :
		return 1
	fi

	if ! mv -Tf -- "$docode_copilot_link_temporary_link" "$docode_copilot_link_path"; then
		docode_copilot_link_warn "$docode_copilot_link_operation: failed to replace $docode_copilot_link_path with $docode_copilot_link_new_target"
		docode_copilot_link_cleanup_temporary || :
		return 1
	fi
	docode_copilot_link_temporary_link_created=false

	if ! docode_copilot_link_cleanup_temporary; then
		return 1
	fi

	return 0
}

docode_copilot_link_install() {
	if ! docode_copilot_link_is_usable "$docode_copilot_link_current_target"; then
		docode_copilot_link_warn "install: current Copilot shim is not a regular executable file at $docode_copilot_link_current_target; preserving $docode_copilot_link_path"
		return 1
	fi

	docode_copilot_link_query_policy "$docode_copilot_link_current_target"
	if [ "$docode_copilot_link_policy" = disabled ]; then
		docode_copilot_link_withdraw install
		return $?
	fi

	if ! docode_copilot_link_wanted "$docode_copilot_link_application_name"; then
		docode_copilot_link_release install
		return $?
	fi

	if [ "$docode_copilot_link_policy" != allowed ]; then
		docode_copilot_link_warn "install: could not read the CopilotCliCommand policy with $docode_copilot_link_current_target; preserving $docode_copilot_link_path"
		return 1
	fi

	if [ -L "$docode_copilot_link_path" ]; then
		if ! docode_copilot_link_read_target "$docode_copilot_link_path"; then
			docode_copilot_link_warn "install: could not inspect $docode_copilot_link_path; preserving it"
			return 1
		fi

		if [ "$docode_copilot_link_read_target" = "$docode_copilot_link_code_target" ] || [ "$docode_copilot_link_read_target" = "$docode_copilot_link_code_insiders_target" ]; then
			docode_copilot_link_replace_recognized "$docode_copilot_link_current_target" "$docode_copilot_link_read_target" install
			return $?
		fi

		return 0
	fi

	if [ -e "$docode_copilot_link_path" ]; then
		return 0
	fi

	if ! ln -s -T -- "$docode_copilot_link_current_target" "$docode_copilot_link_path"; then
		docode_copilot_link_warn "install: failed to create $docode_copilot_link_path pointing to $docode_copilot_link_current_target; preserving the current entry"
		return 1
	fi

	return 0
}

docode_copilot_link_unlink() {
	docode_copilot_link_unlink_expected_target=$1
	docode_copilot_link_operation=$2

	if ! docode_copilot_link_read_target "$docode_copilot_link_path"; then
		docode_copilot_link_warn "$docode_copilot_link_operation: could not recheck $docode_copilot_link_path before removal; preserving it"
		return 1
	fi

	if [ "$docode_copilot_link_read_target" != "$docode_copilot_link_unlink_expected_target" ]; then
		docode_copilot_link_warn "$docode_copilot_link_operation: $docode_copilot_link_path changed before removal; preserving it"
		return 1
	fi

	if ! rm -f -- "$docode_copilot_link_path"; then
		docode_copilot_link_warn "$docode_copilot_link_operation: failed to remove owned link $docode_copilot_link_path"
		return 1
	fi

	return 0
}

# Removes a link that selects either edition's shim, because the CopilotCliCommand policy turns the command off.
docode_copilot_link_withdraw() {
	if [ ! -L "$docode_copilot_link_path" ]; then
		return 0
	fi

	if ! docode_copilot_link_read_target "$docode_copilot_link_path"; then
		docode_copilot_link_warn "$1: could not inspect $docode_copilot_link_path; preserving it"
		return 1
	fi

	if [ "$docode_copilot_link_read_target" = "$docode_copilot_link_code_target" ] || [ "$docode_copilot_link_read_target" = "$docode_copilot_link_code_insiders_target" ]; then
		docode_copilot_link_unlink "$docode_copilot_link_read_target" "$1"
		return $?
	fi

	return 0
}

# Gives up a link that selects the current shim: the other edition takes it over when it wants the command and its
# shim reports that the policy allows it; otherwise the link is removed.
docode_copilot_link_release() {
	if [ ! -L "$docode_copilot_link_path" ]; then
		return 0
	fi

	if ! docode_copilot_link_read_target "$docode_copilot_link_path"; then
		docode_copilot_link_warn "$1: could not inspect $docode_copilot_link_path; preserving it"
		return 1
	fi

	if [ "$docode_copilot_link_read_target" != "$docode_copilot_link_current_target" ]; then
		return 0
	fi

	if docode_copilot_link_is_usable "$docode_copilot_link_other_target" && docode_copilot_link_wanted "$docode_copilot_link_other_application_name"; then
		docode_copilot_link_query_policy "$docode_copilot_link_other_target"
		if [ "$docode_copilot_link_policy" = allowed ]; then
			docode_copilot_link_replace_recognized "$docode_copilot_link_other_target" "$docode_copilot_link_current_target" "$1"
			return $?
		fi
	fi

	docode_copilot_link_unlink "$docode_copilot_link_current_target" "$1"
}

docode_copilot_link_remove() {
	# The current shim is already gone, so only the other edition's shim can report a policy that turns the command off.
	docode_copilot_link_query_policy "$docode_copilot_link_other_target"
	if [ "$docode_copilot_link_policy" = disabled ]; then
		docode_copilot_link_withdraw remove
		return $?
	fi

	docode_copilot_link_release remove
}

docode_copilot_link() {
	docode_copilot_link_action=${1-}
	docode_copilot_link_application_name=${2-}

	if [ "$#" -ne 2 ]; then
		docode_copilot_link_warn "expected an action and application name"
		return 1
	fi

	case "$docode_copilot_link_application_name" in
		code)
			docode_copilot_link_current_target=$docode_copilot_link_code_target
			docode_copilot_link_other_target=$docode_copilot_link_code_insiders_target
			docode_copilot_link_other_application_name=code-insiders
			;;
		code-insiders)
			docode_copilot_link_current_target=$docode_copilot_link_code_insiders_target
			docode_copilot_link_other_target=$docode_copilot_link_code_target
			docode_copilot_link_other_application_name=code
			;;
		*)
			return 0
			;;
	esac

	case "$docode_copilot_link_action" in
		install)
			docode_copilot_link_install
			;;
		remove)
			docode_copilot_link_remove
			;;
		*)
			docode_copilot_link_warn "unknown action $docode_copilot_link_action"
			return 1
			;;
	esac
}
