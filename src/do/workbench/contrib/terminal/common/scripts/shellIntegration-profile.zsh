# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# Prevent recursive sourcing
if [[ -n "$DOCODE_PROFILE_INITIALIZED" ]]; then
	return
fi
export DOCODE_PROFILE_INITIALIZED=1

if [[ $options[norcs] = off && -o "login" ]]; then
	if [[ -f $USER_ZDOTDIR/.zprofile ]]; then
		DOCODE_ZDOTDIR=$ZDOTDIR
		ZDOTDIR=$USER_ZDOTDIR
		. $USER_ZDOTDIR/.zprofile
		ZDOTDIR=$DOCODE_ZDOTDIR
	fi

	# Apply any explicit path prefix (see #99878)
	if (( ${+DOCODE_PATH_PREFIX} )); then
		export PATH="$DOCODE_PATH_PREFIX$PATH"
	fi
	builtin unset DOCODE_PATH_PREFIX
fi
