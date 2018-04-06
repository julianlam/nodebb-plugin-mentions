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
				<label for="disableGroupMentions">Select groups you wish to disable mentions</label>
				<select class="form-control" id="disableGroupMentions" name="disableGroupMentions" multiple size="20">
					<!-- BEGIN groups -->
					<option value="{groups.displayName}">{groups.displayName}</option>
					<!-- END groups -->
				</select>
			</div>
		</div>
	</div>
</form>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>