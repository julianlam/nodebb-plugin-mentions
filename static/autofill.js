$(document).ready(function() {
    $('body').on('focus', '.composer .title, .composer .write', function(){
        var composer = $('.composer .write');
        if (composer.parent('.textcomplete-wrapper').length === 0) {
            composer.textcomplete([
                {
                    match: /\B@(\w*)$/,
                    search: function (term, callback) {
                        socket.emit('modules.composer.autofill', {'term': term}, function(err, data) {
                            callback(data.sort(function(a, b) {							// Sort alphabetically
                                return a.toLocaleLowerCase() > b.toLocaleLowerCase();
                            }));
                        });
                    },
                    index: 1,
                    replace: function (mention) {
                        return '@' + mention + ' ';
                    },
                    cache: true
                }
            ]);
            $('.textcomplete-wrapper').css('height', '100%').find('textarea').css('height', '100%');
        }
    });
});