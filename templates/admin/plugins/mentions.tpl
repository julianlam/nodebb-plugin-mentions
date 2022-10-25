<form role="form" class="mentions-settings">
	<div class="row">
		<div class="col-sm-2 col-12 settings-header">General</div>
		<div class="col-sm-10 col-12">
			<div class="mb-3 form-check">
				<input type="checkbox" class="form-check-input" id="autofillGroups" name="autofillGroups" />
				<label for="autofillGroups" class="form-check-label">
					<span>Allow mentioning User Groups</span>
				</label>
			</div>
			<div class="mb-3 form-check">
				<input type="checkbox" class="form-check-input" id="overrideIgnores" name="overrideIgnores" />
				<label for="overrideIgnores" class="form-check-label">
					<span>Notify recipients of mentions even if topic is explictly ignored</span>
				</label>
			</div>
			<div class="mb-3">
				<label class="form-label" for="disableGroupMentions">Select groups you wish to disable mentions</label>
				<select class="form-control" id="disableGroupMentions" name="disableGroupMentions" multiple>
					<!-- BEGIN groups -->
					<option value="{groups.displayName}">{groups.displayName}</option>
					<!-- END groups -->
				</select>
			</div>
			<div class="mb-3">
				<label class="form-label" for="display">Mentions will display ...</label>
				<select class="form-control" id="display" name="display">
					<option value="">... as written</option>
					<option value="fullname">... as user&apos;s full name (if set)</option>
					<option value="username">... as user&apos;s username</option>
				</select>
			</div>
		</div>
	</div>

	<div class="row">
		<div class="col-sm-2 col-12 settings-header">Restrictions</div>
		<div class="col-sm-10 col-12">
			<div class="mb-3">
				<div class="mb-3 form-check">
					<input type="checkbox" class="form-check-input" id="disableFollowedTopics" name="disableFollowedTopics" />
					<label for="disableFollowedTopics" class="form-check-label">
						<span>Disable mentions for followed topics</span>
					</label>
				</div>
			</div>
			<div class="mb-3">
				<div class="mb-3 form-check">
					<input type="checkbox" class="form-check-input" id="privilegedDirectReplies" name="privilegedDirectReplies" />
					<label for="privilegedDirectReplies" class="form-check-label">
						<span>Restrict mentions to privileged users (mods, global mods, administrators), unless it is a direct reply to a post</span>
					</label>
				</div>
			</div>
		</div>
	</div>
</form>

<!-- IMPORT admin/partials/save_button.tpl -->
