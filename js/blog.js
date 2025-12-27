class BlogPlatform {
    constructor() {
        this.currentUser = this.getCurrentUser();
        this.posts = [];
        this.filteredPosts = [];
        this.categories = [];
        this.years = [];
        this.currentFilter = {
            category: null,
            year: null,
            search: '',
            page: 1,
            limit: 9
        };
        this.hasMorePosts = true;
        this.lastVisible = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadCategories();
        this.loadYears();
        this.loadPosts();
        this.setupRealtimeUpdates();
    }

    getCurrentUser() {
        let user = localStorage.getItem('blog_user');
        if (user) {
            try {
                user = JSON.parse(user);
            } catch {
                user = { id: this.generateUserId(), username: null };
            }
        } else {
            user = { id: this.generateUserId(), username: null };
            localStorage.setItem('blog_user', JSON.stringify(user));
        }
        return user;
    }

    generateUserId() {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    setupEventListeners() {
        // Back button
        document.getElementById('backButton').addEventListener('click', () => {
            if (document.getElementById('fullscreenPost').classList.contains('hidden')) {
                window.history.back();
            } else {
                this.closeFullscreenPost();
            }
        });

        // Settings
        document.getElementById('settingsButton').addEventListener('click', () => this.openSettings());
        document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
        document.getElementById('settingsOverlay').addEventListener('click', () => this.closeSettings());
        document.getElementById('saveUsername').addEventListener('click', () => this.saveUsername());
        document.getElementById('removeUsername').addEventListener('click', () => this.removeUsername());

        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', debounce(() => {
            this.currentFilter.search = searchInput.value.trim();
            this.currentFilter.page = 1;
            document.getElementById('clearSearch').classList.toggle('hidden', !this.currentFilter.search);
            this.loadPosts();
        }, 300));

        document.getElementById('clearSearch').addEventListener('click', () => {
            searchInput.value = '';
            this.currentFilter.search = '';
            document.getElementById('clearSearch').classList.add('hidden');
            this.loadPosts();
        });

        // Year filter
        document.getElementById('yearFilter').addEventListener('change', (e) => {
            this.currentFilter.year = e.target.value || null;
            this.currentFilter.page = 1;
            this.loadPosts();
        });

        // Load more
        document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
            this.currentFilter.page++;
            this.loadPosts(true);
        });

        // Fullscreen post
        document.getElementById('closeFullscreen').addEventListener('click', () => this.closeFullscreenPost());

        // Comments
        document.getElementById('submitComment').addEventListener('click', () => this.submitComment());

        // Username modal
        document.getElementById('useAnonymous').addEventListener('click', () => this.useAnonymous());
        document.getElementById('saveModalUsername').addEventListener('click', () => this.saveModalUsername());

        // Share
        document.getElementById('sharePost').addEventListener('click', () => this.shareCurrentPost());
    }

    async loadCategories() {
        try {
            const snapshot = await firebaseServices.db.collection('categories')
                .where('active', '==', true)
                .orderBy('name')
                .get();
            
            this.categories = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.renderCategories();
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    renderCategories() {
        const container = document.getElementById('categoriesContainer');
        if (!container) return;

        const categories = ['All', ...this.categories.map(c => c.name)];
        
        container.innerHTML = categories.map(category => `
            <button class="category-badge ${category === 'All' && !this.currentFilter.category ? 'active' : ''}"
                    data-category="${category === 'All' ? '' : category}">
                ${category}
            </button>
        `).join('');

        // Add event listeners
        container.querySelectorAll('.category-badge').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category || null;
                this.currentFilter.category = category;
                this.currentFilter.page = 1;
                
                // Update active state
                container.querySelectorAll('.category-badge').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                this.loadPosts();
            });
        });
    }

    async loadYears() {
        try {
            const snapshot = await firebaseServices.db.collection('posts')
                .where('published', '==', true)
                .select('createdAt')
                .get();
            
            const years = new Set();
            snapshot.docs.forEach(doc => {
                const date = doc.data().createdAt?.toDate();
                if (date) {
                    years.add(date.getFullYear());
                }
            });
            
            this.years = Array.from(years).sort((a, b) => b - a);
            this.renderYears();
        } catch (error) {
            console.error('Error loading years:', error);
        }
    }

    renderYears() {
        const select = document.getElementById('yearFilter');
        if (!select) return;

        this.years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });
    }

    async loadPosts(loadMore = false) {
        const postsGrid = document.getElementById('postsGrid');
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        const noResults = document.getElementById('noResults');

        if (!loadMore) {
            postsGrid.innerHTML = `
                <div class="col-span-full flex justify-center items-center py-12">
                    <div class="text-center">
                        <div class="w-16 h-16 border-4 border-emberflare-200 border-t-emberflare-600 rounded-full animate-spin mx-auto mb-4"></div>
                        <p class="text-gray-600">Loading posts...</p>
                    </div>
                </div>
            `;
        }

        try {
            let query = firebaseServices.db.collection('posts')
                .where('published', '==', true)
                .orderBy('createdAt', 'desc');

            // Apply filters
            if (this.currentFilter.category) {
                query = query.where('category', '==', this.currentFilter.category);
            }

            if (this.currentFilter.year) {
                const startDate = new Date(this.currentFilter.year, 0, 1);
                const endDate = new Date(this.currentFilter.year + 1, 0, 1);
                query = query.where('createdAt', '>=', startDate)
                             .where('createdAt', '<', endDate);
            }

            // Pagination
            if (loadMore && this.lastVisible) {
                query = query.startAfter(this.lastVisible);
            }

            query = query.limit(this.currentFilter.limit);

            const snapshot = await query.get();
            
            if (snapshot.empty) {
                if (!loadMore) {
                    postsGrid.innerHTML = '';
                    noResults.classList.remove('hidden');
                }
                this.hasMorePosts = false;
                loadMoreContainer.classList.add('hidden');
                return;
            }

            noResults.classList.add('hidden');
            this.lastVisible = snapshot.docs[snapshot.docs.length - 1];
            this.hasMorePosts = snapshot.docs.length === this.currentFilter.limit;

            const posts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate()
            }));

            // Apply search filter
            if (this.currentFilter.search) {
                const searchLower = this.currentFilter.search.toLowerCase();
                const filtered = posts.filter(post => 
                    post.title.toLowerCase().includes(searchLower) ||
                    post.excerpt.toLowerCase().includes(searchLower) ||
                    post.content.toLowerCase().includes(searchLower) ||
                    post.category.toLowerCase().includes(searchLower)
                );
                this.filteredPosts = loadMore ? [...this.filteredPosts, ...filtered] : filtered;
            } else {
                this.filteredPosts = loadMore ? [...this.filteredPosts, ...posts] : posts;
            }

            this.renderPosts(loadMore);
            loadMoreContainer.classList.toggle('hidden', !this.hasMorePosts);

        } catch (error) {
            console.error('Error loading posts:', error);
            this.showToast('Error loading posts', 'error');
        }
    }

    renderPosts(append = false) {
        const postsGrid = document.getElementById('postsGrid');
        
        if (!append) {
            postsGrid.innerHTML = '';
        }

        if (this.filteredPosts.length === 0) {
            postsGrid.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
                    <h3 class="text-xl font-semibold text-gray-700 mb-2">No posts found</h3>
                    <p class="text-gray-500">Try adjusting your search or filters</p>
                </div>
            `;
            return;
        }

        const postsToRender = append ? 
            this.filteredPosts.slice(-this.currentFilter.limit) : 
            this.filteredPosts;

        postsToRender.forEach(post => {
            const postElement = this.createPostElement(post);
            postsGrid.appendChild(postElement);
        });

        // Add intersection observer for lazy loading
        this.setupLazyLoading();
    }

    createPostElement(post) {
        const div = document.createElement('div');
        div.className = 'post-card animate-in';
        div.innerHTML = `
            <div class="post-image-container">
                ${post.coverImage ? 
                    `<img src="${post.coverImage}" 
                          alt="${post.title}" 
                          class="post-image lazy" 
                          loading="lazy"
                          onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5Y2EzYWYiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='">` :
                    `<div class="post-image bg-gray-200 flex items-center justify-center">
                        <i class="fas fa-newspaper text-gray-400 text-4xl"></i>
                    </div>`
                }
                <span class="category-badge absolute top-3 left-3">${post.category}</span>
            </div>
            <div class="post-content">
                <h3 class="post-title">${post.title}</h3>
                <p class="post-excerpt">${post.excerpt}</p>
                <div class="post-meta">
                    <div class="post-date">
                        <i class="far fa-calendar"></i>
                        ${this.formatDate(post.createdAt)}
                    </div>
                    <button class="read-more" data-post-id="${post.id}">
                        Read more <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;

        // Add click event
        div.querySelector('.read-more').addEventListener('click', (e) => {
            e.preventDefault();
            this.openFullscreenPost(post.id);
        });

        return div;
    }

    async openFullscreenPost(postId) {
        try {
            // Show loading state
            document.getElementById('fullscreenPost').classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            const doc = await firebaseServices.db.collection('posts').doc(postId).get();
            if (!doc.exists) {
                throw new Error('Post not found');
            }

            const post = {
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate()
            };

            // Update URL
            history.pushState({ postId }, '', `?post=${postId}`);

            // Render post
            this.renderFullscreenPost(post);
            
            // Load comments
            this.loadComments(postId);

        } catch (error) {
            console.error('Error loading post:', error);
            this.showToast('Error loading post', 'error');
            this.closeFullscreenPost();
        }
    }

    renderFullscreenPost(post) {
        const contentDiv = document.getElementById('postContent');
        
        // Format content (convert markdown to HTML if needed)
        let content = post.content;
        if (post.contentType === 'markdown') {
            content = this.markdownToHtml(content);
        }

        contentDiv.innerHTML = `
            <article>
                ${post.coverImage ? 
                    `<img src="${post.coverImage}" 
                          alt="${post.title}" 
                          class="w-full h-auto rounded-2xl mb-8"
                          loading="lazy">` : 
                    ''
                }
                <h1>${post.title}</h1>
                <div class="flex items-center gap-4 mb-8 text-gray-600">
                    <span><i class="far fa-calendar mr-2"></i>${this.formatDate(post.createdAt)}</span>
                    <span class="category-badge">${post.category}</span>
                </div>
                ${content}
            </article>
        `;

        // Update page title
        document.title = `${post.title} | Eldrex Writings`;
    }

    closeFullscreenPost() {
        document.getElementById('fullscreenPost').classList.add('hidden');
        document.body.style.overflow = 'auto';
        history.replaceState(null, '', window.location.pathname);
        document.title = 'Eldrex Writings | Personal Blog';
    }

    async loadComments(postId) {
        const commentsList = document.getElementById('commentsList');
        const noComments = document.getElementById('noComments');

        try {
            const snapshot = await firebaseServices.db.collection('comments')
                .where('postId', '==', postId)
                .where('approved', '==', true)
                .orderBy('createdAt', 'desc')
                .get();

            if (snapshot.empty) {
                commentsList.innerHTML = '';
                noComments.classList.remove('hidden');
                return;
            }

            noComments.classList.add('hidden');
            commentsList.innerHTML = '';

            snapshot.docs.forEach(doc => {
                const comment = {
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate()
                };
                commentsList.appendChild(this.createCommentElement(comment));
            });

        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    createCommentElement(comment) {
        const div = document.createElement('div');
        div.className = 'comment animate-in';
        
        const isAdmin = comment.isAdmin;
        const displayName = isAdmin ? 
            `Eldrex Delos Reyes Bula <img src="https://eldrex.landecs.org/verified/badge.png" class="admin-badge" alt="Verified">` :
            (comment.username || 'Anonymous');
        
        div.innerHTML = `
            <div class="comment-header">
                <div class="comment-user">
                    <div class="user-avatar">
                        ${displayName.charAt(0).toUpperCase()}
                    </div>
                    <span class="font-semibold text-gray-900">${displayName}</span>
                </div>
                <span class="comment-time">${this.formatTimeAgo(comment.createdAt)}</span>
            </div>
            <div class="comment-content">${comment.content}</div>
            ${!isAdmin && comment.userId === this.currentUser.id ? `
                <div class="comment-actions">
                    <button class="text-red-600 text-sm hover:text-red-700 delete-comment" data-comment-id="${comment.id}">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </div>
            ` : ''}
        `;

        // Add delete event listener
        const deleteBtn = div.querySelector('.delete-comment');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteComment(comment.id));
        }

        return div;
    }

    async submitComment() {
        const postId = this.getCurrentPostId();
        const content = document.getElementById('commentInput').value.trim();
        
        if (!content) {
            this.showToast('Please enter a comment', 'warning');
            return;
        }

        // Check if user needs to set username
        if (!this.currentUser.username) {
            this.showUsernameModal();
            return;
        }

        try {
            const comment = {
                postId,
                userId: this.currentUser.id,
                username: this.currentUser.username,
                content,
                approved: true, // Auto-approve for now
                isAdmin: false,
                createdAt: firebaseServices.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebaseServices.firestore.FieldValue.serverTimestamp()
            };

            // Check for restricted content
            if (this.containsRestrictedContent(content)) {
                comment.approved = false;
                comment.moderated = true;
                comment.moderationReason = 'Contains restricted content';
            }

            await firebaseServices.db.collection('comments').add(comment);
            
            // Clear input
            document.getElementById('commentInput').value = '';
            
            // Reload comments
            this.loadComments(postId);
            
            this.showToast('Comment posted successfully', 'success');

        } catch (error) {
            console.error('Error posting comment:', error);
            this.showToast('Error posting comment', 'error');
        }
    }

    containsRestrictedContent(text) {
        const restrictedTerms = [
            'eldrex', 'bula', 'delos reyes', 
            'eldrex delos reyes bula'
        ];
        
        const lowerText = text.toLowerCase();
        return restrictedTerms.some(term => lowerText.includes(term));
    }

    async deleteComment(commentId) {
        if (!confirm('Are you sure you want to delete this comment?')) {
            return;
        }

        try {
            const commentRef = firebaseServices.db.collection('comments').doc(commentId);
            const commentDoc = await commentRef.get();
            
            if (!commentDoc.exists) {
                throw new Error('Comment not found');
            }

            const comment = commentDoc.data();
            if (comment.userId !== this.currentUser.id) {
                throw new Error('Unauthorized');
            }

            await commentRef.delete();
            this.showToast('Comment deleted', 'success');
            this.loadComments(this.getCurrentPostId());

        } catch (error) {
            console.error('Error deleting comment:', error);
            this.showToast('Error deleting comment', 'error');
        }
    }

    getCurrentPostId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('post');
    }

    openSettings() {
        const panel = document.getElementById('settingsPanel');
        panel.classList.remove('hidden');
        document.getElementById('usernameInput').value = this.currentUser.username || '';
        
        setTimeout(() => {
            panel.querySelector('.absolute.bottom-0').style.transform = 'translateY(0)';
        }, 10);
    }

    closeSettings() {
        const panel = document.getElementById('settingsPanel');
        panel.querySelector('.absolute.bottom-0').style.transform = 'translateY(100%)';
        setTimeout(() => {
            panel.classList.add('hidden');
        }, 300);
    }

    saveUsername() {
        const username = document.getElementById('usernameInput').value.trim();
        
        if (username && this.containsRestrictedContent(username)) {
            this.showToast('Username contains restricted terms', 'error');
            return;
        }

        this.currentUser.username = username || null;
        localStorage.setItem('blog_user', JSON.stringify(this.currentUser));
        
        // Update display
        document.getElementById('currentUsername').textContent = username || 'Anonymous';
        
        this.showToast('Username saved', 'success');
        this.closeSettings();
    }

    removeUsername() {
        this.currentUser.username = null;
        localStorage.setItem('blog_user', JSON.stringify(this.currentUser));
        document.getElementById('currentUsername').textContent = 'Anonymous';
        document.getElementById('usernameInput').value = '';
        this.showToast('Username removed', 'success');
    }

    showUsernameModal() {
        document.getElementById('usernameModal').classList.remove('hidden');
    }

    hideUsernameModal() {
        document.getElementById('usernameModal').classList.add('hidden');
    }

    useAnonymous() {
        this.hideUsernameModal();
        // Try submitting comment again
        setTimeout(() => this.submitComment(), 100);
    }

    saveModalUsername() {
        const username = document.getElementById('modalUsernameInput').value.trim();
        
        if (username && this.containsRestrictedContent(username)) {
            this.showToast('Username contains restricted terms', 'error');
            return;
        }

        this.currentUser.username = username || null;
        localStorage.setItem('blog_user', JSON.stringify(this.currentUser));
        document.getElementById('currentUsername').textContent = username || 'Anonymous';
        
        this.hideUsernameModal();
        // Try submitting comment again
        setTimeout(() => this.submitComment(), 100);
    }

    shareCurrentPost() {
        const postId = this.getCurrentPostId();
        if (!postId) return;

        const url = `${window.location.origin}${window.location.pathname}?post=${postId}`;
        
        if (navigator.share) {
            navigator.share({
                title: document.querySelector('#postContent h1')?.textContent || 'Eldrex Writings',
                text: 'Check out this post on Eldrex Writings',
                url: url
            });
        } else {
            navigator.clipboard.writeText(url);
            this.showToast('Link copied to clipboard', 'success');
        }
    }

    setupRealtimeUpdates() {
        // Listen for new comments
        firebaseServices.db.collection('comments')
            .where('approved', '==', true)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const postId = change.doc.data().postId;
                        if (postId === this.getCurrentPostId()) {
                            this.loadComments(postId);
                        }
                    }
                });
            });
    }

    setupLazyLoading() {
        const lazyImages = document.querySelectorAll('img.lazy');
        
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.classList.remove('lazy');
                        imageObserver.unobserve(img);
                    }
                });
            });

            lazyImages.forEach(img => imageObserver.observe(img));
        }
    }

    markdownToHtml(markdown) {
        // Simple markdown converter
        return markdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank">$1</a>')
            .replace(/\n\n/gim, '</p><p>')
            .replace(/!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" class="rounded-lg my-4">');
    }

    formatDate(date) {
        if (!date) return '';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatTimeAgo(date) {
        if (!date) return '';
        
        const seconds = Math.floor((new Date() - date) / 1000);
        
        let interval = Math.floor(seconds / 31536000);
        if (interval >= 1) return interval + ' year' + (interval === 1 ? '' : 's') + ' ago';
        
        interval = Math.floor(seconds / 2592000);
        if (interval >= 1) return interval + ' month' + (interval === 1 ? '' : 's') + ' ago';
        
        interval = Math.floor(seconds / 86400);
        if (interval >= 1) return interval + ' day' + (interval === 1 ? '' : 's') + ' ago';
        
        interval = Math.floor(seconds / 3600);
        if (interval >= 1) return interval + ' hour' + (interval === 1 ? '' : 's') + ' ago';
        
        interval = Math.floor(seconds / 60);
        if (interval >= 1) return interval + ' minute' + (interval === 1 ? '' : 's') + ' ago';
        
        return 'Just now';
    }

    showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(toast => toast.remove());
        
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-emberflare-600'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize blog when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if Firebase config is loaded
    if (!window.FIREBASE_API_KEY) {
        console.error('Firebase configuration not found');
        return;
    }
    
    // Initialize blog platform
    window.blog = new BlogPlatform();
    
    // Handle browser navigation
    window.addEventListener('popstate', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const postId = urlParams.get('post');
        
        if (postId && window.blog) {
            window.blog.openFullscreenPost(postId);
        } else if (window.blog) {
            window.blog.closeFullscreenPost();
        }
    });
});
