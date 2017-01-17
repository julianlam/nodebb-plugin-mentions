define('admin/plugins/mentions', ['settings'], function (Settings) {
    var Mentions = {};

    Mentions.init = function () {
        $('#save').on('click', function () {
            var elems = $('#group-list input[type="checkbox"]:not(:checked)');
            var data = [];

            for (var i = 0; i < elems.length; i++) {
                data.push(elems[i].name.toLowerCase())
            }

            var newSettingsValue = {
                mentionDisabledGroups: data
            };

            Settings.set('mentions', {
                '_': JSON.stringify(newSettingsValue)
            }, null, function () {
                app.alert({
                    type: 'success',
                    alert_id: 'mentions-saved',
                    title: 'Reload Required',
                    message: 'Please reload your NodeBB to have your changes take effect',
                    clickfn: function () {
                        socket.emit('admin.reload');
                    }
                });
            });
        });
    };

    return Mentions;
});