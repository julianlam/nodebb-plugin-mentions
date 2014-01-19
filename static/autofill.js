$(document).ready(function() {
    $('body').on('focus', '.composer .title, .composer .write', function(){
        var composer = $('.composer .write');
        if (composer.parent('.textcomplete-wrapper').length === 0) {
            composer.textcomplete([
                {
                    match: /\B@(\w*)$/,
                    search: function (term, callback) {
                        socket.emit('modules.composer.autofill', getUniqueUserslugs(), function(err, data) {
                            callback(data);
                        });
                    },
                    index: 1,
                    maxCount: 5,
                    replace: function (mention) {
                        return '@' + mention + ' ';
                    },
                    cache: true
                }
            ]);
            $('.textcomplete-wrapper').css('height', '100%').find('textarea').css('height', '100%');
        }

        function getUniqueUserslugs() {
            var postContainer = $('#post-container');
            if(postContainer.length) {
                var elements = $('#post-container li[data-userslug]');
                if(!elements.length) {
                    return [];
                }

                var slugs = [];
                for(var i=0; i<elements.length; ++i) {
                    var slug = $(elements[i]).attr('data-userslug');
                    if(slugs.indexOf(slug) === -1) {
                        slugs.push(slug);
                    }
                }

                return slugs;
            } else {
                return [];
            }
        }
    });
});