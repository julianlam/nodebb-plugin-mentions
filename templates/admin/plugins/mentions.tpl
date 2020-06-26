<form role="form" class="mentions-settings">
	<div class="row">
		<div class="col-sm-2 col-xs-12 settings-header">General</div>
		<div class="col-sm-10 col-xs-12">
			<div class="form-group">
				<div class="checkbox">
					<label for="autofillGroups" class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
						<input type="checkbox" class="mdl-switch__input" id="autofillGroups" name="autofillGroups" />
						<span class="mdl-switch__label">Allow mentioning User Groups</span>
					</label>
				</div>
			</div>
			<div class="form-group">
				<div class="checkbox">
					<label for="overrideIgnores" class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
						<input type="checkbox" class="mdl-switch__input" id="overrideIgnores" name="overrideIgnores" />
						<span class="mdl-switch__label">Notify recipients of mentions even if topic is explictly ignored</span>
					</label>
				</div>
			</div>
			<div class="form-group">
				<label for="disableGroupMentions">Select groups you wish to disable mentions</label>
				<select class="form-control" id="disableGroupMentions" name="disableGroupMentions" multiple>
					<!-- BEGIN groups -->
					<option value="{groups.displayName}">{groups.displayName}</option>
					<!-- END groups -->
				</select>
			</div>
			<div class="form-group">
				<label for="display">Mentions will display ...</label>
				<select class="form-control" id="display" name="display">
					<option value="">... as written</option>
					<option value="fullname">... as user&apos;s full name (if set)</option>
					<option value="username">... as user&apos;s username</option>
				</select>
			</div>
		</div>
	</div>

	<div class="row">
		<div class="col-sm-2 col-xs-12 settings-header">Restrictions</div>
		<div class="col-sm-10 col-xs-12">
			<div class="form-group">
				<div class="checkbox">
					<label for="disableFollowedTopics" class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
						<input type="checkbox" class="mdl-switch__input" id="disableFollowedTopics" name="disableFollowedTopics" />
						<span class="mdl-switch__label">Disable mentions for followed topics</span>
					</label>
				</div>
			</div>
			<div class="form-group">
				<div class="checkbox">
					<label for="privilegedDirectReplies" class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
						<input type="checkbox" class="mdl-switch__input" id="privilegedDirectReplies" name="privilegedDirectReplies" />
						<span class="mdl-switch__label">Restrict mentions to privileged users (mods, global mods, administrators), unless it is a direct reply to a post</span>
					</label>
				</div>
			</div>
		</div>
	</div>
</form>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>