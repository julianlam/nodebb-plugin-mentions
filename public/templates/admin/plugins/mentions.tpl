<div class="groups">
    <div class="col-lg-9">
        <div class="panel panel-default">
            <div class="panel-body">
                <table id="group-list" class="table table-striped groups-list">
                    <tr>
                        <th>[[admin/manage/groups:name]]</th>
                        <th>Notifications Enabled</th>
                    </tr>
                    <!-- BEGIN groups -->
                    <tr data-groupname="{groups.displayName}">
                        <td>
                            {groups.displayName}
                        </td>
                        <td>
                            <input type="checkbox" name="{groups.slug}" id="{groups.slug}" <!-- IF groups.canMention --> checked  <!-- ENDIF groups.canMention --> />
                        </td>
                    </tr>
                    <!-- END groups -->
                </table>
                <!-- IMPORT partials/paginator.tpl -->
            </div>
        </div>
    </div>
</div>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>